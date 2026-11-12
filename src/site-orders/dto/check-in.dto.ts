import { IsBoolean } from 'class-validator';

export class CheckInDto {
  /** `true` marca a presença agora; `false` desfaz. */
  @IsBoolean()
  checkedIn: boolean;
}
