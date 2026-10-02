# Wisp: project brief

A wearable, non-lethal protection system. A small drone rides on a light harness on the wearer's back. One press of a chest clasp launches it. It flies to the attacker's face and keeps bright light in their eyes from constantly changing positions, so the attacker can't aim or follow while the wearer gets away. Nobody gets hurt.

This brief is the starting point for hardware research and a first prototype. Everything here is design intent to be tested, not a validated spec.

## The problem

When someone pulls a weapon at close range, you have a second or two. Everything people carry for protection asks them to reach, aim and escalate inside that second. Pepper spray needs finding, uncapping and aiming at arm's length. A firearm needs a draw, both hands and training, and brings lethal force into the situation. Wisp's goal is to end the standoff without injury: make aiming and following very hard for long enough that the wearer can leave.

## How it works, in one paragraph

The wearer has on Silk, a minimal two-strap harness like the lightest backpack, with the drone (Wisp) docked flat on a back plate between the shoulder blades. When threatened, the wearer presses the clasp on the sternum strap. The drone releases, climbs off the back and over the shoulder, finds the face of the person facing the wearer, and puts dazzling light on their eyes. It never hovers still. It keeps moving around the head at arm's length in changing patterns, so it is hard to swat, block or track, and the light keeps coming from new directions. The wearer's hands stay free and visible, and they back away. When the wearer is clear, or holds the clasp to recall it, the drone breaks off, follows and lands. The event is logged.

## Principles

1. **Non-lethal, no contact, no payload.** Only light. No sprays, projectiles, shock, or mounts for them.
2. **Dazzle, not damage.** Light stays within eye-safety limits (check IEC 62471) at the closest flying distance. No lasers.
3. **Photosensitivity-aware.** Default steady light or slow pulse below 3 Hz. Fast strobe only as an opt-in mode, in short bursts, if at all.
4. **One deliberate action.** Two-stage press on the clasp. No phone or app in the loop.
5. **The drone does the aiming.** The wearer never points anything at anyone.
6. **Safe around people.** All rotors fully guarded. Motors stop if grabbed or tumbling. Keeps clear of bystanders and the wearer.
7. **Wearable every day.** Comfortable enough that people actually have it on.
8. **Accountable and private.** Logs time, place, flight path and a short clip, encrypted on the device, shared only by the wearer.
9. **Not a hobby drone.** Launches only from its own harness and flies only this mission. Can't be piloted toward people.

## The three parts

### Silk (harness)
- Two padded shoulder straps that return under the arms like a backpack.
- Sternum strap with the **trigger clasp**: two-stage press to launch, press again to switch target, hold about 2 s to recall. Status light, maybe haptics.
- Thin contoured **back plate** with the **dock**: holds the drone through walking, running, sitting and bumps; charges it; releases it in tens of milliseconds.
- Small battery in the plate to keep the drone topped up; charging port.
- Reliable, low-latency wireless link from clasp to drone, paired only to its own drone.

### Wisp (drone)
- Small multirotor with every rotor guarded above and below (cinewhoop-style ducts are the reference).
- Forward-facing high-output emitters with optics that cover both eyes at working distance despite motion. Thermal design matters; rotor airflow may help cool.
- Forward camera (low light, global shutter preferred) plus a range sensor for face tracking and distance holding.
- On-board compute for vision and flight control; no phone or network needed.
- Battery for a few minutes of active flight at full light, plus reserve to return.
- Dock interface underneath (magnets or latch, charging contacts), status light, log storage.

### Orbit (autonomy)
Flies the whole mission with no steering by the wearer: launch and clear the wearer, find and lock the face, approach to standoff, hold light on the eyes while moving through varied patterns, dodge a reaching hand, avoid obstacles and other people, break off and return, log everything.

## A deployment, step by step

| Phase | What happens | Target to validate |
| --- | --- | --- |
| Docked | On the back plate, charging, standby | Days of standby |
| Arm | Firm two-stage press; motors spin up; dock releases | Tens of ms to release |
| Launch | Lifts off the back, clears head and shoulders, turns to face front | Airborne under ~1 s |
| Acquire | Finds the nearest face turned toward the wearer | Lock in ~1–2 s |
| Light on | Beam lands on the eyes | Under ~3 s from press |
| Orbit | Circles the head at arm's length, changing patterns, beam held on eyes | ~0.4–0.8 m standoff, on target most of the time |
| Break off | Wearer far enough away (~15 m) or holds clasp: drone follows and lands or re-docks | Reliable recall |
| Log | Clip, path, time, place saved encrypted | — |

## Behavior details

- **Target:** nearest face oriented toward the wearer; a second press cycles to the next face. Never the wearer. The system doesn't judge intent; the wearer decides by pressing.
- **Light:** aimed by the whole aircraft in the simplest version (a small gimbal is an option to evaluate). Turns off when the face is lost, range is too short, or the drone is grabbed or tumbling.
- **Patterns** (switch every few seconds so it can't be learned or swatted):
  - Orbit: steady circle at eye level, about half a meter out (default).
  - Figure-8: crosses the line of sight from both sides.
  - Dart: holds, then jumps to a new angle; used when a hand comes up.
  - Halo: circles above the head, lighting the eyes from above, out of reach.
  - Spiral: reverses direction and sweeps up and down.
  - Wide: backs off and varies speed while the wearer moves away.
- **Safety:** minimum distances to faces, people and objects; recover from bumps; safe landing on low battery; mission time limit.

## Open engineering questions (research these)

1. **Light vs eye safety:** what irradiance at 0.3–1 m gives strong dazzle (can't aim) while staying within photobiological limits, at night with dilated pupils? LED choice, drivers, optics, beam angle, heat.
2. **Seeing at night:** face and eye detection before the light is on (IR illumination?) and while the face is brightly lit and moving. Motion blur, dynamic range, which small NPU/vision processor fits the weight and power.
3. **Flying near people:** guard design safe on contact, noise, downwash, positioning around a moving head, obstacle avoidance, surviving swats and maybe relaunching.
4. **Launch from the back:** the drone docks flat, top facing out. How does it safely transition to flight next to the wearer's head? Latch type (permanent vs electro-permanent magnet vs mechanical), holding force when running or falling, release time.
5. **Power:** budget for hover, maneuvering, emitters and compute. How much flight time is really needed? Battery chemistry safety for a body-worn device.
6. **Wearability:** comfort, sitting in car seats, weather, under or over clothing, daily charging.
7. **Legal:** drone rules near and over people, at night, in cities (FAA, EASA); self-defense device and dazzling-light laws; recording and privacy laws; product safety standards.

Starting points to evaluate (not decisions): guarded micro-drone frames (cinewhoop class), open flight stacks (Betaflight, ArduPilot, PX4), small vision computers with NPUs (Raspberry Pi 5 with an AI accelerator, Jetson-class, Rockchip NPU boards, Luxonis OAK modules), global-shutter camera modules, time-of-flight sensors, high-power LED families (Cree XHP, Luminus SST), electro-permanent magnets for the dock.

## Suggested prototyping path

1. **Light bench:** measure emitters and optics at 0.3–1 m (lux, beam profile, temperature over minutes) against eye-safety limits.
2. **Tracking bench:** camera and compute on a stand, tracking a face and a mannequin head in the dark and under the emitter's own light; measure latency.
3. **Flying testbed:** off-the-shelf guarded micro drone plus companion computer; hold 0.5 m from a mannequin head, then fly the patterns.
4. **Light on the testbed:** keep the beam on the mannequin's eye region while moving; measure time on target.
5. **Dock and launch:** back plate on a mannequin; repeatable release and launch that never touches the "wearer"; recall and landing.
6. **Trigger:** two-stage clasp with wireless link: arm, launch, switch target, recall.
7. **Integration:** full sequence with logging and every safety interlock tested.
8. **Controlled trials:** dummies first, then supervised trials with safety measurements.

First-prototype success: one press launches the drone off a mannequin without touching it; within a few seconds it locks onto a second mannequin's head, keeps light on the eye region most of the time for 60 seconds while changing patterns, avoids a swinging arm, and returns on recall.

## Non-goals

Any way to injure; manual piloting toward people; general surveillance; lasers.

## Size

Deliberately open. Let the light, flight time, full rotor guards and comfort set the size and weight, not the concept art.

## Existing material (this repo, `wisp/`)

- Concept website describing the product story.
- `scenario.html`: real-time previs of the encounter showing the intended choreography and timing.
- `studio/`: procedural Blender model of the concept drone and harness (for form studies, not engineering CAD).
- `assets/patterns.js`: the six flight patterns as math.
- Names: Wisp (drone), Silk (harness), Orbit (autonomy). Numbers on the site are placeholders.
