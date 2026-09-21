import { Test, TestingModule } from '@nestjs/testing';
import { RemindersController } from './reminders.controller.js';
import { RemindersService } from './reminders.service.js';

describe('RemindersController', () => {
  let controller: RemindersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RemindersController],
      providers: [{ provide: RemindersService, useValue: {} }],
    }).compile();

    controller = module.get<RemindersController>(RemindersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
