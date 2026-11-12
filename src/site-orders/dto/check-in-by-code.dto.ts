import { IsString, IsUUID, Length } from 'class-validator';

export class CheckInByCodeDto {
  /** O evento da lista de presença aberta: ingresso de outro evento não entra. */
  @IsUUID()
  eventId: string;

  /** O que o leitor leu ou foi digitado (`K7Q2-M9XP`, com ou sem traço). */
  @IsString()
  @Length(4, 20)
  code: string;
}
