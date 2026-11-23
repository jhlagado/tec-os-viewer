        ORG $0100
START:  LD HL,BUF
        LD B,4
FILL:   LD (HL),B
        INC HL
        DJNZ FILL
        RET
BUF:    DS 4
