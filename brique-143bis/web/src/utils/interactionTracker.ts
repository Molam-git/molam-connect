/**
 * BRIQUE 143bis — UI Interaction Tracker
 * Automatically track user interactions for SIRA analysis
 */

import { v4 as uuidv4 } from 'uuid';

let sessionId = uuidv4();
let userId: string | null = null;
let moduleName: string = 'unknown';

export function initializeTracker(config: { userId: string; module: string }) {
  userId = config.userId;
  moduleName = config.module;
  sessionId = uuidv4();

  // Attach global event listeners
  attachEventListeners();
}

function attachEventListeners() {
  // Track clicks
  document.addEventListener('click', handleClick, true);

  // Track missed clicks (clicks on non-interactive elements)
  document.addEventListener('click', handlePotentialMissedClick, true);

  // Track form submissions
  document.addEventListener('submit', handleFormSubmit, true);

  // Track form abandons
  trackFormAbandons();

  // Track typing events
  document.addEventListener('input', handleTypingStart, true);

  // Track scroll
  let scrollTimeout: NodeJS.Timeout;
  document.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(handleScroll, 200);
  });

  // Track resize
  window.addEventListener('resize', handleResize);

  // Track orientation change
  window.addEventListener('orientationchange', handleOrientationChange);
}

async function sendEvent(event: any) {
  if (!userId) return;

  try {
    await fetch('/api/sira/adaptive/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...event,
        session_id: sessionId,
        module: moduleName,
        page_url: window.location.pathname,
        device_type: getDeviceType(),
        screen_width: window.screen.width,
        screen_height: window.screen.height,
        connection_speed: getConnectionSpeed(),
      }),
    });
  } catch (error) {
    console.error('[InteractionTracker] Error sending event:', error);
  }
}

function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement;

  sendEvent({
    event_type: 'click',
    component: target.getAttribute('data-component') || target.className,
    target_element: target.tagName,
  });
}

function handlePotentialMissedClick(e: MouseEvent) {
  const target = e.target as HTMLElement;

  // Check if click was on non-interactive element
  const isInteractive =
    target.tagName === 'BUTTON' ||
    target.tagName === 'A' ||
    target.tagName === 'INPUT' ||
    target.hasAttribute('onclick') ||
    target.hasAttribute('role');

  if (!isInteractive) {
    // Check if there's an interactive element nearby
    const nearbyInteractive = findNearbyInteractiveElement(e.clientX, e.clientY);

    if (nearbyInteractive) {
      sendEvent({
        event_type: 'missed_click',
        target_element: target.tagName,
        intended_element: nearbyInteractive.tagName,
        component: target.getAttribute('data-component'),
      });
    }
  }
}

function findNearbyInteractiveElement(x: number, y: number): HTMLElement | null {
  const radius = 50; // pixels
  const elements = document.elementsFromPoint(x, y);

  for (const el of elements) {
    const htmlEl = el as HTMLElement;
    if (
      htmlEl.tagName === 'BUTTON' ||
      htmlEl.tagName === 'A' ||
      htmlEl.hasAttribute('onclick') ||
      htmlEl.hasAttribute('role')
    ) {
      return htmlEl;
    }
  }

  return null;
}

function handleFormSubmit(e: Event) {
  const form = e.target as HTMLFormElement;

  sendEvent({
    event_type: 'form_submit',
    component: form.getAttribute('data-component') || form.id,
  });
}

function trackFormAbandons() {
  const forms = document.querySelectorAll('form');
  const formStates = new Map<HTMLFormElement, { started: boolean; startTime: number }>();

  forms.forEach((form) => {
    form.addEventListener('input', () => {
      if (!formStates.has(form)) {
        formStates.set(form, { started: true, startTime: Date.now() });
      }
    });
  });

  // Check for abandons when user leaves page
  window.addEventListener('beforeunload', () => {
    formStates.forEach((state, form) => {
      if (state.started) {
        sendEvent({
          event_type: 'form_abandon',
          component: form.getAttribute('data-component') || form.id,
          interaction_duration: Date.now() - state.startTime,
        });
      }
    });
  });
}

const typingStates = new Map<HTMLElement, { startTime: number; chars: number }>();

function handleTypingStart(e: Event) {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement;

  if (!typingStates.has(target)) {
    typingStates.set(target, { startTime: Date.now(), chars: 0 });

    // Track typing end
    target.addEventListener('blur', () => {
      const state = typingStates.get(target);
      if (state) {
        const duration = Date.now() - state.startTime;
        sendEvent({
          event_type: 'typing_end',
          component: target.getAttribute('data-component') || target.name,
          interaction_duration: duration,
          typing_chars: target.value.length,
        });
        typingStates.delete(target);
      }
    });
  }
}

function handleScroll() {
  const scrollDepth = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;

  sendEvent({
    event_type: 'scroll',
    scroll_depth: Math.min(100, scrollDepth),
  });
}

function handleResize() {
  sendEvent({
    event_type: 'resize',
    screen_width: window.innerWidth,
    screen_height: window.innerHeight,
  });
}

function handleOrientationChange() {
  sendEvent({
    event_type: 'orientation_change',
    metadata: { orientation: (screen.orientation as any)?.type || 'unknown' },
  });
}

function getDeviceType(): string {
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function getConnectionSpeed(): string {
  if ('connection' in navigator) {
    return (navigator as any).connection?.effectiveType || 'unknown';
  }
  return 'unknown';
}
