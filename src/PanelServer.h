#pragma once
#include <atomic>
#include <cstdint>
#include <cstring>
#include <memory>
#include <thread>
#include <string>

namespace souz {
// One atomic word is both the authoritative value and its revision. A writer
// cannot publish a revision paired with another writer's value. No locks on GL.
class SpeedState {
    std::atomic<uint64_t> word{0};
public:
    static_assert(ATOMIC_LLONG_LOCK_FREE == 2, "Requires lock-free 64-bit atomics");
    SpeedState() { Set(0.35f, false); }
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

class PanelServer {
public:
    explicit PanelServer(SpeedState& speed);
    ~PanelServer();
    PanelServer(const PanelServer&) = delete;
    PanelServer& operator=(const PanelServer&) = delete;
    void Open() noexcept { openRequested.store(true); }
    unsigned short Port() const noexcept { return port.load(); }
    // Used by the test harness; immutable after startup publication via Port().
    const std::string& Token() const noexcept { return token; }
private:
    void Run() noexcept;
    SpeedState& speed;
    std::string token;
    std::atomic<bool> stopping{false}, openRequested{false};
    std::atomic<unsigned short> port{0};
    std::thread worker;
};
}
