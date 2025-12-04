/**
 * ProgressBar Component - Reusable progress indicator with icon, label, and fill animation
 * Used for displaying operation progress (e.g., audio analysis, processing)
 */

class ProgressBar {
  /**
   * Create a new ProgressBar and append it to the specified container
   * @param {HTMLElement} container - The DOM element to append the progress bar to
   */
  constructor(container) {
    if (!container) {
      throw new Error('ProgressBar requires a container element');
    }

    this.container = container;
    this.element = null;
    this.fillElement = null;
    this.percentageElement = null;
    this.labelElement = null;

    this.createElements();
  }

  /**
   * Create the HTML structure for the progress bar
   * Structure:
   * - analysis-progress (wrapper)
   *   - progress-header (icon + label)
   *   - progress-bar-container (progress bar wrapper)
   *     - progress-bar-fill (animated fill)
   *   - progress-text (percentage display)
   */
  createElements() {
    // Main wrapper
    this.element = document.createElement('div');
    this.element.className = 'analysis-progress';

    // Header with icon and label
    const header = document.createElement('div');
    header.className = 'progress-header';

    const icon = document.createElement('span');
    icon.className = 'progress-icon';
    icon.textContent = '🔍';

    this.labelElement = document.createElement('span');
    this.labelElement.className = 'progress-label';
    this.labelElement.textContent = '分析中...';

    header.appendChild(icon);
    header.appendChild(this.labelElement);

    // Progress bar container
    const barContainer = document.createElement('div');
    barContainer.className = 'progress-bar-container';

    this.fillElement = document.createElement('div');
    this.fillElement.className = 'progress-bar-fill';
    this.fillElement.style.width = '0%';

    barContainer.appendChild(this.fillElement);

    // Percentage text
    this.percentageElement = document.createElement('div');
    this.percentageElement.className = 'progress-text';
    this.percentageElement.textContent = '0%';

    // Assemble and append
    this.element.appendChild(header);
    this.element.appendChild(barContainer);
    this.element.appendChild(this.percentageElement);

    this.container.appendChild(this.element);
  }

  /**
   * Update the progress bar fill and optionally the label
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} [message] - Optional status message to update the label
   */
  update(progress, message) {
    // Clamp progress to 0-100 range
    const clampedProgress = Math.max(0, Math.min(100, progress));

    // Update fill width
    if (this.fillElement) {
      this.fillElement.style.width = `${clampedProgress}%`;
    }

    // Update percentage text
    if (this.percentageElement) {
      this.percentageElement.textContent = `${Math.round(clampedProgress)}%`;
    }

    // Update label if message is provided
    if (message && this.labelElement) {
      this.labelElement.textContent = message;
    }
  }

  /**
   * Remove the progress bar from the DOM
   */
  remove() {
    if (this.element && this.element.parentNode) {
      this.element.remove();
    }

    // Clear references
    this.element = null;
    this.fillElement = null;
    this.percentageElement = null;
    this.labelElement = null;
  }
}

// Export as global variable for access from other modules
window.ProgressBar = ProgressBar;
