import { Body, Controller, Get, Ip, Post, Req } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthOnly, CurrentUser, Public, AuthUser } from '../common/decorators';

class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(4) password!: string;
}
class RefreshDto {
  @IsString() refreshToken!: string;
}
class ForgotDto {
  @IsEmail() email!: string;
}
class ResetDto {
  @IsString() token!: string;
  @IsString() @MinLength(8) newPassword!: string;
}
class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Ip() ip: string, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, ip, req.headers['user-agent']);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Ip() ip: string, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, ip, req.headers['user-agent']);
  }

  @Public()
  @Post('logout')
  logout(@Body() dto: Partial<RefreshDto>) {
    return this.auth.logout(dto.refreshToken);
  }

  @Public()
  @Post('forgot-password')
  forgot(@Body() dto: ForgotDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  reset(@Body() dto: ResetDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  // Authenticated but exempt from the module matrix: identity endpoints
  // are self-scoped by construction.
  @Get('me')
  @AuthOnly()
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }

  @Post('change-password')
  @AuthOnly()
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.userId, dto.currentPassword, dto.newPassword);
  }
}
