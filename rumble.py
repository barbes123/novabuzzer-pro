#...
import sys, time
from evdev import ecodes, InputDevice, ff

if len(sys.argv) < 3:
    sys.exit(1)

device_path = sys.argv[1]
duration_ms = int(sys.argv[2])

try:
    dev = InputDevice(device_path)
    rumble_effect = ff.Rumble(strong_magnitude=0x0000, weak_magnitude=0xc000)
    effect = ff.Effect(
        ecodes.FF_RUMBLE, -1, 0,
        ff.Trigger(0, 0),
        ff.Replay(duration_ms, 0),
        ff.EffectType(ff_rumble_effect=rumble_effect)
    )
    effect_id = dev.upload_effect(effect)
    dev.write(ecodes.EV_FF, effect_id, 1)
    time.sleep(duration_ms / 1000.0)
    dev.erase_effect(effect_id)
except Exception as e:
    print(f"Rumble error: {e}", file=sys.stderr)
