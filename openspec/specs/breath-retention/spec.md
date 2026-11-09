# breath-retention Specification

## Purpose

Owns the Breath Retention preset: rounds of fast breathing followed by a breath hold the user ends, then a short recovery breath. Covers its timing options, the user-ended hold, its display and sounds, and the list of finished rounds.

## Requirements

### Requirement: Breath Retention round structure
The system SHALL run Breath Retention as repeating rounds. Each round is the selected number of breaths, each a breath in followed by a breath out; then a hold with empty lungs that lasts until the user ends it; then a recovery breath in, a 15-second hold with full lungs, and a breath out. The next round then begins, until the user stops the session.

#### Scenario: Round order
- **WHEN** a Breath Retention session with 30 breaths starts
- **THEN** it runs 30 breaths in and out, then the hold, and after the user ends the hold, a breath in, a 15-second hold, and a breath out

#### Scenario: Rounds repeat
- **WHEN** the recovery breath out of a round ends
- **THEN** the first breath in of the next round begins

### Requirement: Hold ends on user action
The hold with empty lungs SHALL have no time limit and SHALL end only when the user presses the Breathe in control or uses the Space key shortcut for it. The Breathe in control SHALL be visible only while the hold is running.

#### Scenario: Hold continues until ended
- **WHEN** the hold has lasted 5 minutes and the user has not pressed Breathe in
- **THEN** the hold is still running and its time keeps counting up

#### Scenario: Breathe in ends the hold
- **WHEN** the user presses Breathe in during the hold
- **THEN** the hold ends at that moment and the recovery breath in begins

#### Scenario: Breathe in hidden outside the hold
- **WHEN** a Breath Retention session is in its breathing or recovery part, or is idle
- **THEN** the Breathe in control is not visible

### Requirement: Space key ends the hold
While the hold with empty lungs is running, the system SHALL end the hold when the user presses Space, exactly as if Breathe in had been pressed, under the same conditions as the other Space shortcuts. Used this way, Space SHALL NOT scroll the page. Outside the hold, Space SHALL NOT affect a running Breath Retention session.

#### Scenario: Space ends the hold
- **WHEN** the hold is running, nothing is focused, and the user presses Space
- **THEN** the hold ends at that moment, the recovery breath in begins, and the recovery tone plays at once, as for Breathe in

#### Scenario: Space outside the hold
- **WHEN** a Breath Retention session is in its breathing or recovery part and the user presses Space
- **THEN** nothing changes

#### Scenario: Held key from Start does not end a hold
- **WHEN** the user starts a session with Space and is still holding it when a hold begins
- **THEN** the hold keeps running until a new Space press or Breathe in

#### Scenario: Focused Reset during the hold
- **WHEN** the hold is running, the Reset control has focus, and the user presses Space
- **THEN** the session ends as for Reset, and the hold is not ended as a Breathe in

### Requirement: Breathe in placement
The Breathe in control SHALL be shown centered on its own row above the preset controls (Breathing pattern, Tempo, Breaths), apart from the Reset control. For every pattern and in every session state, this row SHALL keep its space when Breathe in is hidden, so the circle and the other controls do not move when a session starts or ends, when the hold starts or ends, or when the selected pattern changes.

#### Scenario: Above the preset controls
- **WHEN** the hold is running
- **THEN** Breathe in is shown above the Breathing pattern control, alone on its row, and not next to Reset

#### Scenario: No layout jump at the hold
- **WHEN** a Breath Retention session goes from its breathing part into the hold, and later from the hold into the recovery
- **THEN** the circle and the preset controls keep their size and position

#### Scenario: No layout jump on start and end
- **WHEN** the user starts a Breath Retention session, and later ends it with Reset or Done
- **THEN** the circle and the preset controls keep their size and position

#### Scenario: No layout jump on pattern change
- **WHEN** the user switches between Breath Retention and Balanced Breathing, Box Breathing, or 4-6-7 Breathing
- **THEN** the circle keeps its size and position

### Requirement: Breathing speed follows the tempo
For Breath Retention, the selected tempo SHALL set the length of one full breath to 3.5 seconds multiplied by the tempo's second length, with the breath in and the breath out each lasting half of it. The recovery breath in and breath out SHALL use the same lengths. The 15-second recovery hold SHALL NOT be scaled by the tempo.

#### Scenario: Normal tempo
- **WHEN** a Breath Retention session runs at Normal tempo
- **THEN** each breath in and breath out lasts 1.75 seconds, including the recovery breath, and the recovery hold lasts 15 seconds

#### Scenario: Slow and Fast tempo
- **WHEN** a Breath Retention session runs at Slow or Fast tempo
- **THEN** a full breath lasts 4.375 or 2.8 seconds respectively, and the recovery hold still lasts 15 seconds

### Requirement: Breath count selection
While Breath Retention is selected, the system SHALL offer a breath count control next to the tempo control with the choices 40, 35, 30, 25, and 20, listed in that order from most to fewest, defaulting to 30. The control SHALL NOT be shown for other presets. The selected count SHALL apply when a session starts and SHALL NOT change during a running or paused session.

#### Scenario: Default breath count
- **WHEN** the user selects Breath Retention without touching the breath count
- **THEN** the breath count control shows 30

#### Scenario: Breath count order
- **WHEN** the user opens the breath count control
- **THEN** it lists 40, 35, 30, 25, and 20, in that order from top to bottom

#### Scenario: Control only for Breath Retention
- **WHEN** Balanced Breathing, Box Breathing, or 4-6-7 Breathing is selected
- **THEN** no breath count control is shown

#### Scenario: Count locked during a session
- **WHEN** a Breath Retention session is running
- **THEN** the breath count control is unavailable and the session keeps its breath count

### Requirement: Arrow-key breath count stepping
While Breath Retention is selected, Up Arrow SHALL select the breath count one place above the current one and Down Arrow the one below, as if chosen from the list. Past the top or bottom of the list, the count SHALL wrap to the other end and the tempo SHALL move one place in the same direction; when the tempo is already at that end too, nothing SHALL change. The keys SHALL be available under the same conditions as Arrow-key tempo stepping and SHALL NOT scroll the page while available.

#### Scenario: Up Arrow selects more breaths
- **WHEN** Breath Retention is selected with 30 breaths at Normal, the session is idle, and the user presses Up Arrow
- **THEN** 35 breaths at Normal is selected, as if chosen from the breaths list

#### Scenario: Down Arrow selects fewer breaths
- **WHEN** Breath Retention is selected with 30 breaths at Normal and the user presses Down Arrow
- **THEN** 25 breaths at Normal is selected

#### Scenario: Up past the top moves to the faster tempo
- **WHEN** Breath Retention is selected with 40 breaths at Normal and the user presses Up Arrow
- **THEN** 20 breaths at Fast is selected

#### Scenario: Down past the bottom moves to the slower tempo
- **WHEN** Breath Retention is selected with 20 breaths at Normal and the user presses Down Arrow
- **THEN** 40 breaths at Slow is selected

#### Scenario: No change at the very top
- **WHEN** Breath Retention is selected with 40 breaths at Fast and the user presses Up Arrow
- **THEN** 40 breaths at Fast stays selected and the page does not scroll

#### Scenario: No change at the very bottom
- **WHEN** Breath Retention is selected with 20 breaths at Slow and the user presses Down Arrow
- **THEN** 20 breaths at Slow stays selected and the page does not scroll

#### Scenario: Unavailable during a session
- **WHEN** a Breath Retention session is running or paused and the user presses Up Arrow or Down Arrow
- **THEN** neither the breath count nor the tempo changes

### Requirement: Breathing part display
During the breathing part, the system SHALL show a fully drawn ring in orange with no progress fill, no progress dot, and no tick marks. All circle layers SHALL grow on each breath in and shrink on each breath out, as for other presets. The breath number and the breath count (e.g. `17/30`) SHALL be shown inside the circle.

#### Scenario: Full orange ring
- **WHEN** a Breath Retention session is in its breathing part
- **THEN** the ring is fully drawn in orange and no progress dot or tick marks are shown

#### Scenario: Ring pulses with each breath
- **WHEN** a breath in and then a breath out run
- **THEN** the circle layers grow during the breath in and shrink during the breath out

#### Scenario: Breath number
- **WHEN** the 17th of 30 breaths is running
- **THEN** `17/30` is shown inside the circle

### Requirement: Hold display
During the hold, the system SHALL show a fully drawn ring in light turquoise with no progress fill, no progress dot, and no tick marks. All circle layers SHALL slowly grow and shrink in a 20-second cycle, unrelated to breathing. The hold time SHALL be shown inside the circle, counting up in minutes and seconds.

#### Scenario: Full turquoise ring
- **WHEN** a Breath Retention session is in its hold
- **THEN** the ring is fully drawn in light turquoise and no progress dot or tick marks are shown

#### Scenario: Slow pulse
- **WHEN** the hold runs for 20 seconds
- **THEN** the circle layers grow and shrink back exactly once

#### Scenario: Hold time counts up
- **WHEN** the hold has lasted 92 seconds
- **THEN** `01:32` is shown inside the circle

### Requirement: Recovery display
During the recovery breath in, 15-second hold, and breath out, the system SHALL display each phase as it does for the cyclic presets: phase color, progress fill, progress dot, and phase label. The 15-second hold SHALL show one tick mark per second and the seconds remaining.

#### Scenario: Regular recovery hold
- **WHEN** the recovery hold is 5 seconds in
- **THEN** the ring is the light-gray full-lung hold ring, filled one third, with 15 tick marks, and 10 seconds remaining are shown

### Requirement: Breath Retention night colors
In night mode, the orange breathing ring and the light-turquoise hold ring SHALL be dimmer than in day mode. The hold ring SHALL keep a turquoise hue, and the breathing ring SHALL stay orange, distinguishable from the night-mode amber exhale color.

#### Scenario: Night mode keeps turquoise
- **WHEN** night mode is active during the hold
- **THEN** the hold ring is turquoise and dimmer than in day mode

#### Scenario: Night mode orange
- **WHEN** night mode is active during the breathing part
- **THEN** the breathing ring is orange and dimmer than in day mode

### Requirement: Breath Retention breathing sounds
When sound is on, the system SHALL play a breath-in sound at the start of each breath in of the breathing part and a breath-out sound at the start of each breath out of the breathing part, and no phase-change tones during the breathing part.

#### Scenario: One tick per breath
- **WHEN** sound is on and the breathing part runs
- **THEN** the breath-in sound plays as each breath in begins, the breath-out sound plays as each breath out begins, and no phase-change tone plays

#### Scenario: Last breath out before the hold
- **WHEN** sound is on and the last breath out of the breathing part ends
- **THEN** the breath-out sound played at its start, and the hold's phase-change tone plays as the hold begins

### Requirement: Breath Retention breath sound character
The breath-in sound SHALL be louder and longer than the in-phase tick and SHALL end before the following breath out starts at every tempo. The breath-out sound SHALL be shorter, quieter, and lower than the breath-in sound.

#### Scenario: Breath-in sound is easy to hear
- **WHEN** the breath-in sound plays
- **THEN** it is louder and lasts longer than the in-phase tick

#### Scenario: Breath-in sound ends before the breath out at Fast tempo
- **WHEN** a Breath Retention session runs at Fast tempo, where a breath in lasts 1.4 seconds
- **THEN** each breath-in sound has ended before the breath-out sound of the same breath plays

#### Scenario: Breath-out sound is quieter
- **WHEN** the breath-out sound plays
- **THEN** it is shorter, quieter, and lower in pitch than the breath-in sound

### Requirement: Hold and recovery phase tones
When sound is on, a phase-change tone SHALL play when the hold starts and when each recovery phase starts, and no breath-out sound SHALL play at the recovery breath out. In the recovery hold, in-phase tick sounds SHALL play once per second.

#### Scenario: Hold and recovery tones
- **WHEN** sound is on and the hold starts, and later the recovery breath in, hold, and breath out start
- **THEN** a phase-change tone plays at each of those starts, and no breath-in or breath-out sound plays with them

#### Scenario: Recovery hold ticks
- **WHEN** sound is on and the recovery hold runs
- **THEN** an in-phase tick sound plays once per second

### Requirement: Hold sounds
When sound is on, the system SHALL play a short melody at each full minute of the hold, measured from the hold start: the three phase-change tones in rising order (exhale, hold, inhale pitch). No other sounds SHALL play during the hold. Hold sounds SHALL stop as soon as the hold ends. The user cannot choose other hold sounds.

#### Scenario: Melody on each full minute
- **WHEN** sound is on and the hold runs for 125 seconds
- **THEN** the melody plays at seconds 60 and 120 and no other hold sounds play

#### Scenario: Ending the hold silences hold sounds
- **WHEN** the user presses Breathe in at 59.5 seconds
- **THEN** no melody plays at second 60, and the recovery breath in tone plays at once

#### Scenario: Hold sounds in the background
- **WHEN** sound is on and the page is hidden during a hold
- **THEN** the minute melodies keep playing on time

### Requirement: Completed rounds
A round SHALL count as completed when its hold ends and the recovery breath in begins. The hold time of each completed round SHALL be recorded. A hold that is still running when the session ends SHALL NOT be recorded.

#### Scenario: Round completed at Breathe in
- **WHEN** the user presses Breathe in after a 92-second hold
- **THEN** the round counts as completed with a hold time of 1:32, even if the session ends during the recovery

#### Scenario: Running hold is not recorded
- **WHEN** the user ends the session during a hold
- **THEN** that hold is not added to the finished rounds

### Requirement: Finished rounds list
The system SHALL list the completed rounds below the circle, or beside it in short, wide viewports with no free space below the circle, one line per round with its number and hold time in minutes and seconds, adding each round as it completes. The list SHALL remain after the session ends and SHALL be cleared when a new session starts.

#### Scenario: Live list
- **WHEN** the second round's hold ends after 125 seconds, following a first hold of 92 seconds
- **THEN** below the circle, `Round 1 01:32` and `Round 2 02:05` are listed

#### Scenario: List stays after the session
- **WHEN** the user presses Done after two completed rounds
- **THEN** the circle returns to idle and both rounds stay listed

#### Scenario: New session clears the list
- **WHEN** the user starts a new session
- **THEN** the finished rounds list is empty

### Requirement: Finished rounds list keeps the circle in place
Adding a round SHALL NOT change the circle's position or size, and the list SHALL NOT cover the circle. A list too long for its space SHALL scroll within that space.

#### Scenario: Circle stays in place when a round is added
- **WHEN** a round completes during a running session
- **THEN** the round is listed and the circle keeps its position and size

#### Scenario: Long list
- **WHEN** more rounds are listed than fit the free space
- **THEN** the list scrolls within that space, the circle is not covered, the controls stay in place, and the page does not become scrollable because of the list
