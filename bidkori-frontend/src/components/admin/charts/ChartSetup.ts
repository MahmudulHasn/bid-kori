'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

let registered = false;

export function ensureChartRegistered() {
  if (!registered) {
    ChartJS.register(
      CategoryScale,
      LinearScale,
      PointElement,
      LineElement,
      BarElement,
      ArcElement,
      Title,
      Tooltip,
      Legend,
      Filler,
    );
    registered = true;
  }
}
