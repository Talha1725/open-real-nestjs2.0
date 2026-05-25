import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { Public } from '../common/decorators/public.decorator.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
import { MfaLoginDto } from './dto/mfa-login.dto.js';
import { GoogleAuthDto } from './dto/google-auth.dto.js';
import { AuthSensitiveThrottle } from '../common/decorators/throttle-policy.decorator.js';
import type { Response } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    const isProd = process.env.NODE_ENV === 'production';
    const common = [
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      ...(isProd ? ['Secure'] : []),
    ].join('; ');

    // Access token (short-lived)
    res.append(
      'Set-Cookie',
      `or_access=${encodeURIComponent(accessToken)}; ${common}`,
    );
    // Refresh token (long-lived)
    res.append(
      'Set-Cookie',
      `or_refresh=${encodeURIComponent(refreshToken)}; ${common}`,
    );
    // Non-sensitive helper cookie for UI/middleware (not a source of truth)
    res.append(
      'Set-Cookie',
      `or_authenticated=true; Path=/; SameSite=Lax${isProd ? '; Secure' : ''}`,
    );
  }

  private setMfaCookie(res: Response, mfaToken: string) {
    const isProd = process.env.NODE_ENV === 'production';
    const common = [
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      ...(isProd ? ['Secure'] : []),
    ].join('; ');

    res.append(
      'Set-Cookie',
      `or_mfa=${encodeURIComponent(mfaToken)}; ${common}; Max-Age=300`, // 5 minute expiry matching token
    );
  }

  private clearAuthCookies(res: Response) {
    const isProd = process.env.NODE_ENV === 'production';
    const base = `Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${
      isProd ? '; Secure' : ''
    }`;
    res.append('Set-Cookie', `or_access=; ${base}`);
    res.append('Set-Cookie', `or_refresh=; ${base}`);
    res.append('Set-Cookie', `or_authenticated=; ${base}`);
    res.append('Set-Cookie', `or_mfa=; ${base}`);
  }

  private clearMfaCookie(res: Response) {
    const isProd = process.env.NODE_ENV === 'production';
    const base = `Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${
      isProd ? '; Secure' : ''
    }`;
    res.append('Set-Cookie', `or_mfa=; ${base}`);
  }

  private readCookie(
    headers: Record<string, any>,
    key: string,
  ): string | undefined {
    const raw = headers?.cookie as string | undefined;
    if (!raw) return undefined;
    const parts = raw.split(';').map((p) => p.trim());
    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const k = part.slice(0, eq);
      if (k === key) return decodeURIComponent(part.slice(eq + 1));
    }
    return undefined;
  }

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    if (result.accessToken && result.refreshToken) {
      this.setAuthCookies(res, result.accessToken, result.refreshToken);
    }
    return { user: result.user };
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful, returns JWT tokens or MFA challenge',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    if ('requiresMfa' in result) {
      this.setMfaCookie(res, result.mfaToken);
      return { requiresMfa: true, mfaToken: result.mfaToken };
    }
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    // Do not return raw tokens to the browser (HttpOnly cookies are the source of truth)
    return { user: result.user };
  }

  @Public()
  @Post('google')
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in or sign up with Google' })
  @ApiBody({ type: GoogleAuthDto })
  @ApiResponse({
    status: 200,
    description: 'Google authentication successful, or MFA challenge required',
  })
  @ApiResponse({ status: 401, description: 'Invalid Google credential' })
  async googleAuth(
    @Body() dto: GoogleAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.googleAuth(dto);
    if ('requiresMfa' in result) {
      this.setMfaCookie(res, result.mfaToken);
      return { requiresMfa: true, mfaToken: result.mfaToken };
    }
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Public()
  @Post('login/mfa')
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete MFA login with TOTP code' })
  @ApiBody({ type: MfaLoginDto })
  @ApiResponse({ status: 200, description: 'MFA verified, tokens returned' })
  @ApiResponse({ status: 401, description: 'Invalid MFA token or code' })
  async loginMfa(
    @Body() dto: MfaLoginDto,
    @Headers() headers: Record<string, any>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const mfaToken = dto.mfaToken || this.readCookie(headers, 'or_mfa');
    if (!mfaToken) {
      throw new UnauthorizedException('MFA token missing or expired');
    }

    const result = await this.authService.loginMfa({ ...dto, mfaToken });
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    this.clearMfaCookie(res);
    return { user: result.user };
  }

  @Public()
  @Post('mfa/login')
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete MFA login with TOTP code (alias)' })
  @ApiBody({ type: MfaLoginDto })
  @ApiResponse({ status: 200, description: 'MFA verified, tokens returned' })
  @ApiResponse({ status: 401, description: 'Invalid MFA token or code' })
  async loginMfaAlias(
    @Body() dto: MfaLoginDto,
    @Headers() headers: Record<string, any>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.loginMfa(dto, headers, res);
  }

  @Public()
  @Post('mfa/verify')
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify MFA TOTP code and complete login (alias)' })
  @ApiBody({ type: MfaLoginDto })
  @ApiResponse({ status: 200, description: 'MFA verified, tokens returned' })
  @ApiResponse({ status: 401, description: 'Invalid MFA token or code' })
  async verifyMfaAlias(
    @Body() dto: MfaLoginDto,
    @Headers() headers: Record<string, any>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.loginMfa(dto, headers, res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'New token pair returned' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @Body() dto: Partial<RefreshTokenDto>,
    @Headers() headers: Record<string, any>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieRefresh = this.readCookie(headers, 'or_refresh');
    const refreshToken = dto?.refreshToken ?? cookieRefresh;
    if (!refreshToken) {
      // Keep Unauthorized semantics consistent with service
      return this.authService.refreshToken({
        refreshToken: '',
      } as RefreshTokenDto);
    }
    const tokens = await this.authService.refreshToken({ refreshToken });
    this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return { ok: true };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address with token' })
  @ApiBody({ type: VerifyEmailDto })
  @ApiResponse({ status: 200, description: 'Email verified' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Public()
  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend verification email' })
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({ status: 200, description: 'Verification email resent' })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Reset instructions sent (always returns success)',
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @AuthSensitiveThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout (invalidate tokens)' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  async logout(
    @Headers('authorization') authHeader: string,
    @Headers() headers: Record<string, any>,
    @Res({ passthrough: true }) res: Response,
    @Body('refreshToken') refreshToken?: string,
  ) {
    const accessToken =
      authHeader?.replace(/^Bearer\s+/i, '') ??
      this.readCookie(headers, 'or_access') ??
      '';
    const refresh = refreshToken ?? this.readCookie(headers, 'or_refresh');
    const result = await this.authService.logout(accessToken, refresh);
    this.clearAuthCookies(res);
    return result;
  }
}
