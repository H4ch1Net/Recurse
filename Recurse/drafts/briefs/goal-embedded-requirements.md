# Embedded Software Engineer (entry level): requirement list

Sources: common asks in junior/new-grad embedded and firmware postings (C, MCUs, peripherals, buses,
RTOS, debugging tools, git, test), common embedded interview topics (volatile, ISRs, bit masks,
endianness, struct packing, priority inversion, I2C vs SPI, debouncing, ring buffers, fixed point),
and public embedded roadmaps (C -> architecture -> MCU peripherals -> buses -> RTOS -> tools/testing).

| # | Requirement | Covered by |
|---|---|---|
| 1 | Write C: types, control flow, functions, pointers, arrays, structs, stack/heap/static, undefined behavior | c-memory (other agent), cs-how-code-runs |
| 2 | Fixed-width integers, volatile, const in flash, bit fields | embedded-systems s1-s3 |
| 3 | Number systems, hex, two's complement, overflow | cs-number-systems |
| 4 | Bit manipulation: set/clear/toggle/test, masks, shifts, fields | swe-bit-manipulation, embedded-systems s2 |
| 5 | Computer architecture: CPU, registers, memory hierarchy, fetch-execute | cs-computer-architecture |
| 6 | MCU anatomy, memory map, memory-mapped I/O, startup, linker sections | embedded-systems s0, s1, s9 |
| 7 | GPIO, interrupts/ISRs/NVIC, timers, PWM, ADC, watchdog, low power | embedded-systems s4-s8 |
| 8 | UART, SPI, I2C, CAN: framing, modes, addressing, arbitration, choosing a bus | embedded-protocols |
| 9 | Endianness, packing bytes into frames, checksums | embedded-protocols s6 |
| 10 | Reading timing diagrams, logic analyzer use | embedded-protocols s0, s8; firmware-engineering s8 |
| 11 | RTOS: tasks, scheduling, preemption, context switch, mutex/semaphore, queues, priority inversion, stack sizing | rtos-basics; operating-systems for general OS |
| 12 | Electronics: Ohm's law, dividers, pull-ups, LEDs, logic levels, transistors, decoupling, schematics, multimeter | electronics-basics |
| 13 | Reading datasheets and register maps | embedded-systems s1, s4; electronics-basics s8 |
| 14 | Firmware design: superloop, layering/HAL, state machines, ring buffers, debouncing, fixed point | firmware-engineering s0-s4 |
| 15 | Testing firmware: host unit tests, fakes for hardware, TDD, CI | firmware-engineering s5, swe-testing |
| 16 | Debugging: GDB over SWD/JTAG, breakpoints, watchpoints, HardFault analysis, timing measurement | firmware-engineering s6-s8, swe-debugging, embedded-systems s9 |
| 17 | Toolchain: cross compiler, make/CMake basics, .elf/.hex/.bin, flashing | embedded-systems s9, firmware-engineering s9 |
| 18 | Code quality: warnings, static analysis, MISRA awareness, releases | firmware-engineering s9, swe-clean-code |
| 19 | Version control and Linux shell | git-basics, swe-git-collaboration, linux-cli |
| 20 | Data structures and algorithms basics for interviews | data-structures, big-o, swe-linked-lists, swe-bit-manipulation (challenge set bit-manipulation) |
| 21 | Scripting for tools/tests (Python on the host) | python-basics |
| 22 | Portfolio evidence on hardware | projects: embedded-sensor-logger, embedded-button-state-machine (Wokwi or real board) |
| 23 | Interviews and job search | swe-interview-playbook, swe-behavioral-interviews, swe-resume-portfolio, swe-internship-search |

Gaps found: everything in rows 2, 6-12, 14-18 had no pack. Endianness, ring buffers, state machines,
debouncing, fixed point and HardFault debugging were not covered anywhere, so the fifth pack
(firmware-engineering) was added.
