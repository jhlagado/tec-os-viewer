        ORG $0100
START:  LD HL,$1234
        PUSH HL
TAKE:   POP DE
        RET
