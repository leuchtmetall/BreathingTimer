# url-settings Specification

## Purpose

Lets the user bookmark a preferred setup: the pattern, tempo, breath count, sound, and theme can be set through the URL query string, and the query follows the current settings when the app is served over http or https.

## Requirements

### Requirement: Settings from the query string
At load, the system SHALL take its starting settings from the URL query parameters `pattern`, `tempo`, `breaths`, `sound`, and `theme`. Each parameter is optional and SHALL apply on its own. This SHALL work both over http or https and from a local file.

#### Scenario: Full setup from the URL
- **WHEN** the app is opened with `?pattern=breath-retention&tempo=slow&breaths=40&sound=off&theme=night`
- **THEN** Breath Retention is selected at Slow tempo with 40 breaths, sound is off, and night mode is active

#### Scenario: No query
- **WHEN** the app is opened with no query string
- **THEN** Balanced Breathing at 5.5 s per phase is selected, sound is on, and the mode follows the operating system preference

#### Scenario: From a local file
- **WHEN** the built file is opened from the file system with `?pattern=box&tempo=7`
- **THEN** Box Breathing at 7 s per phase is selected

### Requirement: Query parameter values
`pattern` SHALL take `balanced`, `box`, `467`, or `breath-retention`. `tempo` SHALL take the selected pattern's tempo choice: the phase length in seconds for Balanced Breathing (`4`, `5`, `5.5`, `6`, `7`) and Box Breathing (`3`, `4`, `5`, `7`, `8`), and `slow`, `normal`, or `fast` otherwise. `breaths` SHALL take `20`, `25`, `30`, `35`, or `40`. `sound` SHALL take `on` or `off`, and `theme` `day` or `night`.

#### Scenario: Tempo by phase length
- **WHEN** the app is opened with `?pattern=balanced&tempo=6`
- **THEN** Balanced Breathing at 6 s per phase is selected

#### Scenario: Tempo by name
- **WHEN** the app is opened with `?pattern=467&tempo=fast`
- **THEN** 4-6-7 Breathing at Fast tempo is selected

#### Scenario: Tempo without a pattern
- **WHEN** the app is opened with `?tempo=4`
- **THEN** Balanced Breathing at 4 s per phase is selected

### Requirement: Invalid query values are ignored
A missing, unknown, or invalid parameter value SHALL fall back to that setting's default without changing the other settings, and SHALL NOT stop the app from loading. A `tempo` that the selected pattern does not offer SHALL fall back to that pattern's default tempo. Unknown parameters SHALL be ignored.

#### Scenario: Unknown pattern
- **WHEN** the app is opened with `?pattern=square&sound=off`
- **THEN** Balanced Breathing at 5.5 s per phase is selected and sound is off

#### Scenario: Tempo not offered by the pattern
- **WHEN** the app is opened with `?pattern=box&tempo=slow`
- **THEN** Box Breathing at 5 s per phase is selected

#### Scenario: Breath count not offered
- **WHEN** the app is opened with `?pattern=breath-retention&breaths=33`
- **THEN** Breath Retention is selected with 30 breaths

#### Scenario: Breath count without Breath Retention
- **WHEN** the app is opened with `?pattern=box&breaths=40`, and the user then selects Breath Retention
- **THEN** Box Breathing is selected first, and the breath count shows 40 once Breath Retention is selected

### Requirement: Query follows the settings over http
When the app is served over http or https, every change to the pattern, tempo, breath count, sound switch, or night mode override SHALL rewrite the query string to the current settings at once. The rewrite SHALL NOT reload the page or add a history entry, and SHALL keep the fragment and any other query parameters.

#### Scenario: Pattern change
- **WHEN** the app is served over https and the user selects Box Breathing
- **THEN** the address bar shows `pattern=box&tempo=5`, and pressing Back does not return to the previous pattern

#### Scenario: Bookmark restores the setup
- **WHEN** the app is served over https, the user selects 4-6-7 Breathing at Slow tempo and turns sound off, and then reloads the page
- **THEN** 4-6-7 Breathing at Slow tempo is selected and sound is off

#### Scenario: Other parameters kept
- **WHEN** the app is served over https at `?ref=home#top` and the user selects Box Breathing
- **THEN** the URL keeps `ref=home` and `#top` alongside the settings

#### Scenario: Toggles during a session
- **WHEN** the app is served over https and the user turns sound off or toggles night mode while a session is running
- **THEN** the query is updated and the session continues uninterrupted

### Requirement: Query contents
The written query SHALL always carry `pattern` and `tempo`. It SHALL carry `breaths` only while Breath Retention is selected, `sound=off` only while sound is off, and `theme` only while a night mode override is applied. A written query SHALL restore the same settings when loaded.

#### Scenario: Breath Retention query
- **WHEN** the app is served over https and the user selects Breath Retention at Normal tempo with 35 breaths
- **THEN** the query reads `pattern=breath-retention&tempo=normal&breaths=35`

#### Scenario: Defaults for sound and theme
- **WHEN** the app is served over https, sound is on, and no night mode override is applied
- **THEN** the query has no `sound` or `theme` parameter

#### Scenario: Override written
- **WHEN** the app is served over https and the user applies the night mode override
- **THEN** the query carries `theme=night`, or `theme=day` when the override chose day mode

### Requirement: Query left alone from a local file
When the app is opened from a local file, the system SHALL NOT rewrite the URL, and settings changes SHALL apply only to the open page. The app SHALL also NOT rewrite the URL at load, whatever the protocol.

#### Scenario: Local file
- **WHEN** the built file is opened from the file system and the user selects Box Breathing
- **THEN** the URL is unchanged

#### Scenario: No rewrite at load
- **WHEN** the app is served over https and opened with no query string
- **THEN** the URL stays without a query until the user changes a setting
