import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-workspace',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class Workspace {}
