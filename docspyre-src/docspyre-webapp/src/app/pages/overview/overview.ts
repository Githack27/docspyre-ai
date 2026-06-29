import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-overview',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class Overview {}
