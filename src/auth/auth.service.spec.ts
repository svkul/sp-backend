import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthAuditService } from './auth-audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: AuthAuditService,
          useValue: { record: jest.fn() },
        },
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              const n = {
                'auth.refreshTokenAbsoluteMaxMs': 180 * 24 * 60 * 60 * 1000,
                'auth.refreshTokenTtlWebMs': 14 * 24 * 60 * 60 * 1000,
                'auth.refreshTokenTtlMobileMs': 90 * 24 * 60 * 60 * 1000,
              } as const;
              if (key in n) return n[key as keyof typeof n];
              throw new Error(`Unexpected config key: ${key}`);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
