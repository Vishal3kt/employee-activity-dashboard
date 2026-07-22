import { TestBed } from '@angular/core/testing';

import { Graph } from './graph';

describe('Graph', () => {
  let service: Graph;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Graph);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
