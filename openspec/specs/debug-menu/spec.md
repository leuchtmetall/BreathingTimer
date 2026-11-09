# debug-menu Specification

## Purpose

A developer-only menu, present only in debug mode, for reaching any phase of the selected pattern at once, showing a finished session's results, and playing each sound on demand, so visual and audio checks do not need a session run in real time.

## Requirements

### Requirement: Debug menu presence
The system SHALL show a debug menu only when debug mode is on. When debug mode is off, the menu SHALL NOT be part of the page. The menu SHALL be collapsed when the page loads and SHALL be opened and closed by the user. It SHALL NOT cover the session controls.

#### Scenario: No menu in normal use
- **WHEN** debug mode is off
- **THEN** the page contains no debug menu

#### Scenario: Menu in debug mode
- **WHEN** debug mode is on and the page loads
- **THEN** a collapsed debug menu is shown, and opening it shows the phase jumps, the results entries, and the sound buttons

### Requirement: Phase jump entries
The debug menu SHALL list jump entries for the selected pattern, tempo, and breath count, updated whenever they change. For Balanced, Box, and 4-6-7 Breathing it SHALL offer, for each phase of the cycle, a jump to its start and a jump to 3 seconds before its end. A jump that would land before its phase's start SHALL land on the phase start.

#### Scenario: 4-6-7 entries
- **WHEN** 4-6-7 Breathing is selected
- **THEN** the menu offers inhale, hold, and exhale, each at its start and 3 seconds before its end

#### Scenario: Entries follow the selection
- **WHEN** the user changes the pattern from Box Breathing to Breath Retention
- **THEN** the menu lists the Breath Retention entries instead of the Box Breathing ones

### Requirement: Breath Retention jump entries
For Breath Retention, the debug menu SHALL offer: the breathing part's start and its last 3 seconds; the hold's start and 3 seconds before its first full minute; and, for each recovery phase, its start and its last 3 seconds. A jump that would land before its phase's start SHALL land on the phase start.

#### Scenario: Breath Retention entries
- **WHEN** Breath Retention is selected
- **THEN** the menu offers 10 entries: breathing start and last 3 s, hold start and 0:57, and the recovery breath in, hold, and breath out, each at its start and last 3 s

#### Scenario: Short phase
- **WHEN** Breath Retention at Fast tempo is selected and the user picks the last 3 seconds of the recovery breath in, which lasts 1.4 seconds
- **THEN** the session lands at the start of the recovery breath in

### Requirement: Jumping to a phase
Choosing a jump entry SHALL start a new session of the selected pattern at that point in its first cycle or round, from idle, running, or paused, and the session SHALL keep running from there with its normal display and sounds. The jump SHALL clear any summary and finished rounds below the circle. For a Breath Retention jump into the recovery, the session SHALL have round 1 completed with a hold time of 1:00.

#### Scenario: Jump from idle
- **WHEN** the session is idle with 4-6-7 Breathing selected and the user picks the exhale start
- **THEN** a session is running, showing the exhale at its start, and the exhale tone plays if sound is on

#### Scenario: Jump to the hold minute
- **WHEN** the user picks the Breath Retention hold at 3 seconds before its first full minute and waits 3 seconds
- **THEN** the hold shows `01:00` and the hold melody plays if sound is on

#### Scenario: Jump into the recovery
- **WHEN** the user picks the start of the Breath Retention recovery hold
- **THEN** the recovery hold is running, `Round 1 01:00` is listed below the circle, and the reset control is labeled Done

#### Scenario: Jump to the end of a cycle
- **WHEN** the user picks the last 3 seconds of the final phase of a Box Breathing cycle and waits 3 seconds
- **THEN** the second cycle begins and the reset control is labeled Done

### Requirement: Results entries
The debug menu SHALL offer entries that show the results of a finished session of the selected pattern, tempo, and breath count, updated whenever they change: 3 cycles for Balanced, Box, and 4-6-7 Breathing, and 1, 3, and 12 rounds for Breath Retention. Choosing an entry from any session state SHALL end in idle with those results shown as after pressing Done, without playing a sound.

#### Scenario: Cycle results
- **WHEN** 4-6-7 Breathing is selected and the user picks the 3 cycles entry
- **THEN** the session is idle, and the stats line below the circle starts with `Cycles: 3`

#### Scenario: Multiple rounds
- **WHEN** Breath Retention is selected and the user picks the 3 rounds entry
- **THEN** the session is idle, the stats line starts with `Rounds: 3`, and `Round 1 01:00`, `Round 2 01:15`, and `Round 3 01:30` are listed

#### Scenario: From a running session
- **WHEN** a session is running and the user picks a results entry
- **THEN** the session ends, its queued sounds are cancelled, and only the chosen results are shown

#### Scenario: Next session clears the results
- **WHEN** results from an entry are shown and the user presses Start
- **THEN** the results clear, as after any session

### Requirement: Sound buttons
The debug menu SHALL offer one button for each sound the app makes: the inhale, hold, and exhale phase tones, the in-phase tick, the Breath Retention breath-in and breath-out sounds, and the hold minute melody. Pressing a button SHALL play that sound at once, whether a session is idle, running, or paused, and whether sound is on or off. It SHALL NOT change the session or the queued session sounds.

#### Scenario: Play a tone while idle
- **WHEN** the session is idle and the user presses the exhale tone button
- **THEN** the exhale tone plays once

#### Scenario: Breath sounds
- **WHEN** the user presses the breath-in sound button, and then the breath-out sound button
- **THEN** each plays once, the same as during the Breath Retention breathing part

#### Scenario: Melody plays in full
- **WHEN** the user presses the hold minute melody button
- **THEN** the three rising tones play in order, the same as during a hold

#### Scenario: Session sounds unaffected
- **WHEN** a session is running and the user presses the tick button
- **THEN** the tick plays and the session's own sounds continue on time
