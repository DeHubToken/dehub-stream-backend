import { ReqloggerMiddleware } from './reqlogger.middleware';

describe('ReqloggerMiddleware', () => {
  it('should be defined', () => {
    expect(new ReqloggerMiddleware()).toBeDefined();
  });
});
