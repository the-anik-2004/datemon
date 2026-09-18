import { IsString } from 'class-validator';

export class RefreshDto {
  @IsString({message:"Token must be a string"})
  refreshToken: string;
}