const COLOR_LOW = '#34d399';
const COLOR_MEDIUM = '#fbbf24';
const COLOR_HIGH = '#f87171';
const COLOR_PRIMARY = '#38bdf8';
const COLOR_SECONDARY = '#60a5fa';

const buildChart = (ctx, config) => {
  if (!ctx || typeof Chart === 'undefined') {
    return null;
  }
  return new Chart(ctx, config);
};

const createSeverityChart = (ctx) =>
  buildChart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['High', 'Medium', 'Low'],
      datasets: [
        {
          data: [0, 0, 0],
          backgroundColor: [COLOR_HIGH, COLOR_MEDIUM, COLOR_LOW],
          borderWidth: 0,
          cutout: '65%',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#cbd5f5' },
        },
      },
    },
  });

const createServiceChart = (ctx) =>
  buildChart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Findings',
          data: [],
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: '#cbd5f5' }, grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { color: '#cbd5f5' },
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
        },
      },
      plugins: {
        legend: { display: false },
      },
    },
  });

const createTimelineChart = (ctx) =>
  buildChart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Findings per scan',
          data: [],
          fill: true,
          borderColor: COLOR_PRIMARY,
          backgroundColor: 'rgba(14, 165, 233, 0.25)',
          tension: 0.4,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: '#cbd5f5' }, grid: { display: false } },
        y: { ticks: { color: '#cbd5f5' }, grid: { color: 'rgba(148, 163, 184, 0.2)' } },
      },
      plugins: {
        legend: { display: false },
      },
    },
  });

export const createChartController = ({ severityCtx, serviceCtx, timelineCtx }) => ({
  severity: createSeverityChart(severityCtx),
  service: createServiceChart(serviceCtx),
  timeline: createTimelineChart(timelineCtx),
});

export const updateSeverityDistribution = (controller, counts = { high: 0, medium: 0, low: 0 }) => {
  if (!controller?.severity) return;
  const dataset = controller.severity.data.datasets[0];
  dataset.data = [counts.high || 0, counts.medium || 0, counts.low || 0];
  controller.severity.update();
};

export const updateServiceBreakdown = (controller, services = {}) => {
  if (!controller?.service) return;
  const sorted = Object.entries(services).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 6);
  controller.service.data.labels = top.map(([label]) => label);
  controller.service.data.datasets[0].data = top.map(([, value]) => value);
  controller.service.update();
};

export const updateTimeline = (controller, points = []) => {
  if (!controller?.timeline) return;
  controller.timeline.data.labels = points.map((point) => point.label);
  controller.timeline.data.datasets[0].data = points.map((point) => point.value);
  controller.timeline.update();
};
