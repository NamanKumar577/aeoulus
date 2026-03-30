# aeouluAeoulus: HV Precharge Sensing & Hardware Threshold Circuit

Overview

This repository contains the hardware design for the Aeoulus High Voltage (HV) traction bus sensing and precharge circuit. This circuit safely steps down, isolates, and monitors the HV traction bus. It provides both a continuous analog telemetry signal and a hardware-level digital trigger to the MCU for executing the critical Make-Before-Break precharge contactor sequence.

Hardware Architecture

Stage 1: HV Attenuation

A 1MΩ / 5kΩ resistive voltage divider reduces the raw HV pack voltage down to a safe, measurable low-voltage range suitable for the isolation amplifier.

Stage 2: Galvanic Isolation (ISO224)

The stepped-down HV signal passes through an ISO224 precision isolation amplifier. This safely bridges the high-voltage and low-voltage domains, outputting a proportional differential signal while protecting the low-voltage control electronics from deadly potentials.

Stage 3: Differential to Single-Ended Conversion

An operational amplifier (U2) configured as a difference amplifier converts the ISO224's differential output into a clean, single-ended, ground-referenced analog voltage (HV_SENSE_SAFE).

Stage 4: Hardware Schmitt Trigger (LM393)

A dedicated voltage comparator (U3A) monitors HV_SENSE_SAFE against an adjustable reference voltage set by trimmer RV1.

Reference Tuning: RV1 is tuned to represent 95% of the maximum HV pack voltage.

Hysteresis: R13 (100kΩ) provides positive feedback to prevent signal chatter.

MCU Trigger: When the bus reaches 95%, the open-collector output releases, allowing an external 3.3V pull-up resistor to snap the STM32 input line HIGH. This hardware trigger commands the MCU to immediately close the Main AIR and subsequently open the Precharge relay.

Hardware Note: Unused comparator inputs (U3B) are tied to GND to prevent parasitic oscillation from EV powertrain EMI.

Links

Project Website: https://namankumar577.github.io/aeoulus/

Source Code / Hardware Files: https://github.com/NamanKumar577/aeouluss
