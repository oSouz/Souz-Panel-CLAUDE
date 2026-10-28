#pragma once
#include "PanelSchema.h"
#include <array>
#include <atomic>
#include <cstdint>
#include <cstring>
#include <memory>
#include <thread>
#include <string>

namespace souz {
// One atomic word is both the authoritative value and its revision. A writer
// cannot publish a revision paired with another writer's value. No locks on GL.
class ParamSlot {
    std::atomic<uint64_t> word{0};
public:
    static_assert(ATOMIC_LLONG_LOCK_FREE == 2, "Requires lock-free 64-bit atomics");
    void Set(float value, bool web) noexcept {
        uint32_t bits; std::memcpy(&bits, &value, sizeof bits);
        auto old = word.load();
        uint64_t next;
        do {
            const auto revision = ((old >> 33) + 1) & 0x7fffffffULL;
            next = (revision << 33) | (uint64_t(web) << 32) | bits;
        } while (!word.compare_exchange_weak(old, next));
    }
    uint64_t Snapshot() const noexcept { return word.load(); }
    static float Value(uint64_t snapshot) noexcept {
        uint32_t bits = uint32_t(snapshot); float value;
        std::memcpy(&value, &bits, sizeof value); return value;
    }
    static bool FromWeb(uint64_t snapshot) noexcept { return (snapshot >> 32) & 1; }
};

// Every plugin parameter that the panel can see, indexed like the host indexes them.
class ParamBank {
    std::array<ParamSlot, kPanelCount> slots;
public:
    static constexpr unsigned Count = kPanelCount;
    ParamBank() { for (unsigned i = 0; i < Count; ++i) slots[i].Set(kPanelDefault[i], false); }
    void Set(unsigned i, float value, bool web) noexcept { if (i < Count) slots[i].Set(value, web); }
    uint64_t Snapshot(unsigned i) const noexcept { return i < Count ? slots[i].Snapshot() : 0; }
    float Value(unsigned i) const noexcept { return i < Count ? ParamSlot::Value(slots[i].Snapshot()) : 0.0f; }
    static float Decode(uint64_t snapshot) noexcept { return ParamSlot::Value(snapshot); }
    static bool FromWeb(uint64_t snapshot) noexcept { return ParamSlot::FromWeb(snapshot); }
};

class PanelServer {
public:
    explicit PanelServer(ParamBank& bank);
    ~PanelServer();
    PanelServer(const PanelServer&) = delete;
    PanelServer& operator=(const PanelServer&) = delete;
    void Open() noexcept { openRequested.store(true); }
    unsigned short Port() const noexcept { return port.load(); }
    // Used by the test harness; immutable after startup publication via Port().
    const std::string& Token() const noexcept { return token; }
private:
    void Run() noexcept;
    ParamBank& bank;
    std::string token;
    std::atomic<bool> stopping{false}, openRequested{false};
    std::atomic<unsigned short> port{0};
    std::thread worker;
};
}
