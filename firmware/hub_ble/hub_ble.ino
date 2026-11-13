#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <driver/gpio.h>
#include <esp_system.h>
#include <atomic>
#include "PinMap.h"
#include "HubController.h"
#include "BleProtocol.h"
#include "Hx710Frame.h"
#if !defined(CONFIG_IDF_TARGET_ESP32)
#error "This pin map requires a classic ESP32."
#endif

HubController controller(ENABLED_MASK);
QueueHandle_t commands;
BLECharacteristic *statusChar,*infoChar;
std::atomic<bool> connected{false},restartAdvertising{false},serialStop{false},endContinuous{false};
std::atomic<uint32_t> session{0};
portMUX_TYPE stateMux=portMUX_INITIALIZER_UNLOCKED, adcMux=portMUX_INITIALIZER_UNLOCKED;
uint8_t statusBytes[20]={},detailBytes[6][20]={};
// Stop mailbox bypasses the normal queue; only controlTask changes GPIO.
Command stopCommand;
bool stopPending=false;
uint16_t lastSeq=0;
Reply reply=Reply::None;
uint32_t currentSession=0,lastSample=0,lastAttempt=0;
int32_t raw=0;
bool haveSample=false,frameError=false;

void fillInfo(uint8_t*b){
 memset(b,0,20);b[0]=PROTOCOL_VERSION;b[1]=ENABLED_MASK;b[2]=SENSOR_CHANNEL;b[3]=2;
 put16(b+4,HubController::MIN_PUMP);put16(b+6,HubController::MAX_PUMP);put16(b+8,HubController::MAX_HOLD);
 put16(b+10,HubController::LEAD);put16(b+12,HubController::MAX_RELEASE);put32(b+14,session.load());b[18]=15;
}
class InfoCallbacks:public BLECharacteristicCallbacks{
 void onRead(BLECharacteristic*c) override {uint8_t b[20];fillInfo(b);c->setValue(b,20);}
};
class ServerCallbacks:public BLEServerCallbacks{
 void onConnect(BLEServer*)override{uint32_t n=esp_random();session.store(n?n:1);connected.store(true);}
 void onDisconnect(BLEServer*)override{
   connected.store(false);session.store(0);restartAdvertising.store(true);
   endContinuous.store(true); // Finite patterns finish; continuous patterns finish their current cycle.
 }
};
class CommandCallbacks:public BLECharacteristicCallbacks{
 void onWrite(BLECharacteristic*c)override{
   const String bytes=c->getValue();Command cmd;
   if(!decodeCommand(reinterpret_cast<const uint8_t*>(bytes.c_str()),bytes.length(),cmd))return;
   if(!connected.load() || cmd.session!=session.load())return;
   cmd.receivedAt=millis();
   if(cmd.op==2){portENTER_CRITICAL(&stateMux);stopCommand=cmd;stopPending=true;portEXIT_CRITICAL(&stateMux);}
   else xQueueSend(commands,&cmd,0); // Full queue drops; never blocks the GPIO task.
 }
};
void applyOutputs(){
 for(uint8_t ch=0;ch<6;++ch)if(ENABLED_MASK&(1<<ch))if(!controller.pump(ch))gpio_set_level((gpio_num_t)PUMP_PINS[ch],0);
 for(uint8_t ch=0;ch<6;++ch)if(ENABLED_MASK&(1<<ch))gpio_set_level((gpio_num_t)VALVE_PINS[ch],controller.valve(ch));
 for(uint8_t ch=0;ch<6;++ch)if((ENABLED_MASK&(1<<ch))&&controller.pump(ch))gpio_set_level((gpio_num_t)PUMP_PINS[ch],1);
}
struct AdcIO{
 bool dataHigh(){return gpio_get_level((gpio_num_t)DATA_PIN)!=0;}
 uint32_t pulse(){gpio_set_level((gpio_num_t)CLOCK_PIN,1);delayMicroseconds(2);uint32_t b=dataHigh();gpio_set_level((gpio_num_t)CLOCK_PIN,0);delayMicroseconds(2);return b;}
}adc;
void sampleSensor(uint32_t now){
 if(adc.dataHigh() || now-lastAttempt<20)return;
 lastAttempt=now;int32_t value=0;
 portENTER_CRITICAL(&adcMux);delayMicroseconds(2);HxFrameResult result=hxReadFrame(adc,value);portEXIT_CRITICAL(&adcMux);
 if(result==HxFrameResult::Sample){raw=value;lastSample=millis();haveSample=true;frameError=false;}
 else if(result==HxFrameResult::DataStuckLow)frameError=true;
}
void process(Command c,uint32_t now){
 reply=applyCommand(controller,c,session.load(),currentSession,lastSeq,reply,now);
}
void controlTask(void*){
 for(;;){
   const uint32_t now=millis();
   const uint32_t nonce=session.load();
   if(nonce!=currentSession){currentSession=nonce;lastSeq=0;reply=Reply::None;}
   if(endContinuous.exchange(false))controller.endContinuous();
   controller.update(now);
   if(serialStop.exchange(false)){controller.stop();reply=Reply::Stopped;xQueueReset(commands);}
   Command c;bool haveStop;
   portENTER_CRITICAL(&stateMux);haveStop=stopPending;c=stopCommand;stopPending=false;portEXIT_CRITICAL(&stateMux);
   if(haveStop)process(c,now);
   for(unsigned n=0;n<4 && xQueueReceive(commands,&c,0)==pdTRUE;++n)process(c,now);
   applyOutputs();sampleSensor(now);controller.update(millis());applyOutputs();
   const uint32_t sampledAt=millis();
   uint32_t age=haveSample?sampledAt-lastSample:65535;
   const uint8_t flags=(haveSample?1:0)|(haveSample&&!frameError&&age<500?2:0)|(frameError?4:0)|((haveSample&&(raw==8388607 || raw==-8388608))?8:0);
   uint8_t b[20],details[6][20];
   encodeSummary(b,controller,currentSession,lastSeq,reply,flags,raw,age>65535?65535:age);
   for(uint8_t ch=0;ch<6;++ch)encodeDetail(details[ch],controller,ch,currentSession,sampledAt);
   portENTER_CRITICAL(&stateMux);memcpy(statusBytes,b,20);memcpy(detailBytes,details,sizeof(details));portEXIT_CRITICAL(&stateMux);
   vTaskDelay(pdMS_TO_TICKS(1));
 }
}
void setup(){
 for(uint8_t ch=0;ch<6;++ch)if(ENABLED_MASK&(1<<ch)){
   gpio_set_level((gpio_num_t)PUMP_PINS[ch],0);gpio_set_level((gpio_num_t)VALVE_PINS[ch],0);
   pinMode(PUMP_PINS[ch],OUTPUT);pinMode(VALVE_PINS[ch],OUTPUT);
 }
 gpio_set_level((gpio_num_t)CLOCK_PIN,0);pinMode(CLOCK_PIN,OUTPUT);pinMode(DATA_PIN,INPUT_PULLUP);
 Serial.begin(115200);Serial.println("MEDITATION VEST BLE v2: CH1 pump=D22 valve=D23; CH2 pump=D25 valve=D26; OUT=D32 SCK=D33. x stops.");
 commands=xQueueCreate(4,sizeof(Command));
 if(!commands){Serial.println("Queue allocation failed; outputs remain OFF.");return;}
 if(xTaskCreatePinnedToCore(controlTask,"inflate-control",4096,nullptr,3,nullptr,1)!=pdPASS){Serial.println("Control task failed; BLE not started.");return;}
 BLEDevice::init("MeditationVest");BLEDevice::setMTU(23);
 BLEServer*server=BLEDevice::createServer();server->setCallbacks(new ServerCallbacks());
 BLEService*service=server->createService(SERVICE_UUID);
 auto*command=service->createCharacteristic(COMMAND_UUID,BLECharacteristic::PROPERTY_WRITE);command->setCallbacks(new CommandCallbacks());
 statusChar=service->createCharacteristic(STATUS_UUID,BLECharacteristic::PROPERTY_READ|BLECharacteristic::PROPERTY_NOTIFY);statusChar->addDescriptor(new BLE2902());
 infoChar=service->createCharacteristic(INFO_UUID,BLECharacteristic::PROPERTY_READ);infoChar->setCallbacks(new InfoCallbacks());
 uint8_t info[20];fillInfo(info);infoChar->setValue(info,20);
 service->start();auto*adv=BLEDevice::getAdvertising();adv->addServiceUUID(SERVICE_UUID);adv->setScanResponse(true);adv->setMinPreferred(0x06);adv->setMaxPreferred(0x12);BLEDevice::startAdvertising();
 Serial.println("Advertising MeditationVest. Sensor display-only; finite patterns finish after disconnect; continuous patterns end after current cycle.");
}
void loop(){
 for(unsigned n=0;n<32 && Serial.available();++n){char c=Serial.read();if(c=='x'||c=='X')serialStop.store(true);}
 if(restartAdvertising.exchange(false))BLEDevice::startAdvertising();
 static uint32_t lastNotify=0;
 if(statusChar && millis()-lastNotify>=100){
   lastNotify=millis();uint8_t b[20],details[6][20];
   portENTER_CRITICAL(&stateMux);memcpy(b,statusBytes,20);memcpy(details,detailBytes,sizeof(details));portEXIT_CRITICAL(&stateMux);
   statusChar->setValue(b,20);if(connected.load())statusChar->notify();
   for(uint8_t ch=0;ch<6 && connected.load();++ch)if(ENABLED_MASK&(1<<ch)){statusChar->setValue(details[ch],20);statusChar->notify();}
   statusChar->setValue(b,20); // Reads return the summary, never an arbitrary channel detail.
 }
 delay(5); // Only BLE/telemetry task sleeps; control timers run independently.
}
