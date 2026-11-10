import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-overview',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styles: ':host { display: flex; flex-direction: column; flex: 1; min-height: 0; }',
})
export class Overview {}
