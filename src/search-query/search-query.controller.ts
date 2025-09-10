import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { SearchQueryService } from './search-query.service';
import { Request } from 'express';

@Controller('search')
export class SearchQueryController {
  constructor(private readonly searchQueryService: SearchQueryService) {}

  @Get()
  async search(
    @Query('q') q: string,
    @Query('page') page: number,
    @Query('unit') unit: number,
    @Query('type') type: 'accounts' | 'livestreams' | 'videos',
    @Req() req: Request,
  ) {
    if (!q) {
      return { result: { accounts: [], livestreams: [], videos: [] } };
    }

    const address = req.query.address as string; // optional wallet

    await this.searchQueryService.logSearch(q, address);

    const result = await this.searchQueryService.searchAll({
      search: q,
      page: Number(page) || 0,
      unit: Number(unit) || 20,
      type,
      address,
    });

    return { result };
  }

  @Get('suggestions')
  async getSuggestions(@Query('q') q: string) {
    if (!q) return [];
    return this.searchQueryService.getSuggestions(q);
  }

  @Post('log')
  async logSearch(@Body('term') term: string) {
    if (!term) return { success: false };
    await this.searchQueryService.logSearch(term);
    return { success: true };
  }
}
