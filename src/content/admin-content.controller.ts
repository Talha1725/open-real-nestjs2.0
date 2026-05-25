import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AdminStateChangeThrottle } from '../common/decorators/throttle-policy.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { ContentService } from './content.service.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import { QueryArticlesDto } from './dto/query-articles.dto.js';

@ApiTags('Admin - Content')
@ApiBearerAuth('access-token')
@Controller('admin/content')
@Roles('ADMIN')
export class AdminContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get()
  @ApiOperation({ summary: 'List all articles (admin)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: ['EDUCATION', 'NEWS', 'FAQ'],
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: 200, description: 'Paginated article list' })
  listArticles(@Query() query: QueryArticlesDto) {
    return this.contentService.listArticles(query);
  }

  @Post()
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Create a new article' })
  @ApiBody({ type: CreateArticleDto })
  @ApiResponse({ status: 201, description: 'Article created' })
  @ApiResponse({ status: 409, description: 'Slug already exists' })
  createArticle(
    @Body() dto: CreateArticleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.contentService.createArticle(dto, user.sub);
  }

  @Patch(':id')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Update an article' })
  @ApiBody({ type: UpdateArticleDto })
  @ApiResponse({ status: 200, description: 'Article updated' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  @ApiResponse({ status: 409, description: 'Slug already exists' })
  updateArticle(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.contentService.updateArticle(id, dto, user.sub);
  }

  @Delete(':id')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Delete an article' })
  @ApiResponse({ status: 200, description: 'Article deleted' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  deleteArticle(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.contentService.deleteArticle(id, user.sub);
  }
}
