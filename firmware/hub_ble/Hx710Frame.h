#pragma once
#include <stdint.h>

// HX710(A/B): 24 MSB-first two's-complement bits, then one pulse to select
// differential input at 10 samples/s. Caller supplies timing/critical section.
enum class HxFrameResult { NotReady, Sample, DataStuckLow };

inline int32_t hxSigned24(uint32_t bits) {
  bits &= 0xFFFFFFu;
  return (bits & 0x800000u) ? static_cast<int32_t>(bits) - 16777216L
                           : static_cast<int32_t>(bits);
}

template <class IO>
HxFrameResult hxReadFrame(IO& io, int32_t& value) {
  if (io.dataHigh()) return HxFrameResult::NotReady;
  uint32_t bits = 0;
  for (unsigned i = 0; i < 24; ++i) bits = (bits << 1) | io.pulse();
  io.pulse(); // Pulse 25: next conversion is differential input, 10 SPS.
  if (!io.dataHigh()) return HxFrameResult::DataStuckLow;
  value = hxSigned24(bits);
  return HxFrameResult::Sample;
}
