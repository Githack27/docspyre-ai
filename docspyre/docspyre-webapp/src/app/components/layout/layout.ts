import { Component } from '@angular/core';
import { Header } from '../shared/header/header';
import { Sidebar } from '../shared/sidebar/sidebar';
import { ContentArea } from '../content-area/content-area';

@Component({
  selector: 'app-layout',
  imports: [Header, Sidebar, ContentArea],
  templateUrl: './layout.html',
  styleUrl: './layout.css',
})
export class Layout {}
