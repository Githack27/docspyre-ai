import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-templates',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class Templates {}
