10 REM Bounce: sprites on the PICO9918 from BAZA BASIC
20 REM Tap A left, D right, W up or S down, or use the
25 REM arrow keys. Q quits
30 REM The ROM services: video claims the screen,
40 REM tone beeps and the font gives one glyph's rows
50 DEF CALL vi = ROM 3: DEF CALL bp = ROM 4: DEF CALL gl = ROM 17
60 REM The PICO console's VDP entries: register,
70 REM fill VRAM and copy RAM to VRAM
80 DEF CALL vr = "PICO", 3, 8: DEF CALL vf = "PICO", 3, 9
90 DEF CALL vw = "PICO", 3, 10
100 CALL vi, b = 1
110 REM Graphics I with 16x16 sprites: names at &H1800,
120 REM colours &H2000, sprites &H1B00, their patterns &H3800
130 FOR i = 0 TO 7: READ v: CALL vr, b = i, a = v: NEXT
140 DATA 0, 194, 6, 128, 0, 54, 7, 1
150 CALL vf, hl = 0, de = 16384, a = 0
160 REM The ROM's font for characters 32 to 127
170 g$ = "12345678": FOR c% = 32 TO 127: CALL gl, b = c%, hl = g$: CALL vw, hl = 256 + 8 * (c% - 32), de = g$, bc = 8: NEXT
180 REM Two stars, characters 1 and 2, and a brick, 8
190 p$ = "": FOR i = 1 TO 16: READ v: p$ = p$ + CHR$(v): NEXT
200 CALL vw, hl = 8, de = p$, bc = 16
210 DATA 0, 0, 0, 16, 0, 0, 0, 0, 16, 16, 124, 56, 108, 68, 0, 0
220 p$ = "": FOR i = 1 TO 8: READ v: p$ = p$ + CHR$(v): NEXT
230 CALL vw, hl = 64, de = p$, bc = 8
240 DATA 255, 128, 128, 128, 255, 8, 8, 8
250 REM Colours: text yellow, stars white, bricks red
260 CALL vf, hl = 8192, de = 32, a = 177
270 CALL vf, hl = 8192, de = 1, a = 241: CALL vf, hl = 8193, de = 1, a = 134
280 REM The playfield: a brick wall and random stars
290 CALL vf, hl = 6144, de = 768, a = 32
300 CALL vf, hl = 6144, de = 32, a = 8: CALL vf, hl = 6880, de = 32, a = 8
310 FOR i = 1 TO 22: l = 6144 + 32 * i
320 CALL vf, hl = l, de = 1, a = 8: CALL vf, hl = l + 31, de = 1, a = 8: NEXT
330 FOR i = 1 TO 40: r = 2 + INT(RND(1) * 20): c = 1 + INT(RND(1) * 30)
340 CALL vf, hl = 6144 + 32 * r + c, de = 1, a = 1 + INT(RND(1) * 2): NEXT
350 t$ = " BAZA BASIC ON THE PICO9918 "
360 CALL vw, hl = 6146, de = t$, bc = LEN(t$)
370 REM Sprite patterns: a ball and a ship
380 s$ = "": FOR i = 1 TO 64: READ v: s$ = s$ + CHR$(v): NEXT
390 CALL vw, hl = 14336, de = s$, bc = 64
400 DATA 7, 31, 63, 127, 127, 255, 255, 255, 255, 255, 255, 127, 127, 63, 31, 7
410 DATA 224, 248, 252, 254, 254, 255, 255, 255
415 DATA 255, 255, 255, 254, 254, 252, 248, 224
420 DATA 1, 3, 3, 7, 7, 15, 31, 63, 127, 255, 255, 249, 240, 224, 192, 128
430 DATA 128, 192, 192, 224, 224, 240, 248, 252
435 DATA 254, 255, 255, 159, 15, 7, 3, 1
440 REM Four balls, sprites 0 to 3, and the ship, 4. The loop's
445 REM numbers are integers, which BAZA compiles as 16-bit code
450 DIM x%(3), y%(3), dx%(3), dy%(3), a%(3)
460 FOR i = 0 TO 3: x%(i) = 20 + i * 48: y%(i) = 20 + i * 30
470 dx%(i) = 1 + i: dy%(i) = 4 - i: READ c: ad = 6912 + 4 * i: a%(i) = ad
480 CALL vf, hl = ad + 2, de = 1, a = 0: CALL vf, hl = ad + 3, de = 1, a = c
485 NEXT
490 DATA 8, 3, 7, 13
500 px% = 120: py% = 150
510 CALL vf, hl = 6930, de = 1, a = 4: CALL vf, hl = 6931, de = 1, a = 15
520 CALL vf, hl = 6932, de = 1, a = 208
530 sc% = 0: GOSUB 800
535 CALL vf, hl = 6928, de = 1, a = py%: CALL vf, hl = 6929, de = 1, a = px%
540 REM The main loop, one frame a pass
550 GOSUB 900
560 FOR i% = 0 TO 3
570 x%(i%) = x%(i%) + dx%(i%)
572 IF x%(i%) < 8 THEN 580
574 IF x%(i%) <= 232 THEN 590
580 dx%(i%) = 0 - dx%(i%): x%(i%) = x%(i%) + dx%(i%)
585 x%(i%) = x%(i%) + dx%(i%): CALL bp, b = 40, de = 30
590 y%(i%) = y%(i%) + dy%(i%)
592 IF y%(i%) < 8 THEN 600
594 IF y%(i%) <= 168 THEN 605
600 dy%(i%) = 0 - dy%(i%): y%(i%) = y%(i%) + dy%(i%)
602 y%(i%) = y%(i%) + dy%(i%): CALL bp, b = 50, de = 30
605 REM A ball falling onto the ship is caught
606 IF dy%(i%) <= 0 THEN 620
608 d% = x%(i%) - px%: IF d% < 0 THEN d% = 0 - d%
610 IF d% >= 14 THEN 620
612 d% = y%(i%) - py%: IF d% < 0 THEN d% = 0 - d%
614 IF d% >= 14 THEN 620
616 dy%(i%) = 0 - dy%(i%): sc% = sc% + 1: GOSUB 800: CALL bp, b = 20, de = 80
620 ad% = a%(i%): CALL vf, hl = ad%, de = 1, a = y%(i%)
625 ad% = ad% + 1: CALL vf, hl = ad%, de = 1, a = x%(i%)
630 NEXT
640 k$ = INKEY$: IF k$ = "" THEN 695
641 IF k$ = CHR$(27) THEN GOSUB 950
645 IF k$ = "Q" OR k$ = "q" THEN 700
650 IF (k$ = "A" OR k$ = "a") AND px% > 12 THEN px% = px% - 6
660 IF (k$ = "D" OR k$ = "d") AND px% < 228 THEN px% = px% + 6
670 IF (k$ = "W" OR k$ = "w") AND py% > 12 THEN py% = py% - 6
680 IF (k$ = "S" OR k$ = "s") AND py% < 164 THEN py% = py% + 6
690 CALL vf, hl = 6928, de = 1, a = py%: CALL vf, hl = 6929, de = 1, a = px%
695 GOTO 550
700 CALL vi, b = 0
710 PRINT "THANKS FOR PLAYING. SCORE"; sc%
720 END
800 REM The score, on the bottom wall
810 t$ = " SCORE" + STR$(sc%) + " ": CALL vw, hl = 6882, de = t$, bc = LEN(t$)
820 RETURN
900 REM Wait for the VDP's next frame, or a moment
910 w% = 0
920 w% = w% + 1: IF w% >= 300 THEN 930
925 IF INP(191) < 128 THEN 920
930 RETURN
950 REM An arrow key comes as ESC, "[" and a letter: A up,
955 REM B down, C right and D left, read as W, S, D and A
960 k$ = "": GOSUB 990: IF e$ <> "[" THEN RETURN
965 GOSUB 990: IF e$ = "A" THEN k$ = "W"
970 IF e$ = "B" THEN k$ = "S"
975 IF e$ = "C" THEN k$ = "D"
980 IF e$ = "D" THEN k$ = "A"
985 RETURN
990 REM The next byte, waiting a moment for it
993 w% = 0
995 e$ = INKEY$: IF e$ <> "" THEN RETURN
997 w% = w% + 1: IF w% < 50 THEN 995
999 RETURN
