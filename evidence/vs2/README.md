# VS2 qualification checkpoint

Product code `d193838f5b8f13f8f0852984c3439a9272e09654`, TEC-OS `fe2097f4bad3f7578aa41b8bce8aa571c451dbc7`, on branch `vs2-green-console`.

VG10, VG11 and VG12 have passed, with 44/44 product tests and zero skips. All qualifying commands explicitly select `TECOS_ROM_ASSEMBLER=atom`, including subprocesses. Backend traces confirm ATOM. The exact TED cursor is `L186 C27` after inserting `the ` before `TEC-OS.`.

VG9's two fresh builds and prior-ROM control remain pending. The standing failure controls run so far failed at their required assertions. The missing-embed control is still completing. Results are supplied for the driver's judgment.

The locked gates are in Origo `gates-vs2.md`, SHA-256 `0e969c091a559c30193e637529ad9bbb7ad65d365e85a7a4441adc31616f961a`. VS1's gate readings are unchanged. Exact commands, environment, exit codes and sampled resources are retained alongside this record.
