/**
 * CCNNonMatchForm Accessibility Tests - CUR-247
 *
 * Tests accessibility features of the CCNNonMatchForm component including:
 * - Form labels and associations
 * - Radio group accessibility
 * - Error announcements
 * - Character counter with aria-live
 * - Keyboard navigation
 * - axe-core automated checks
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { CCNNonMatchForm } from '../CCNNonMatchForm';

expect.extend(toHaveNoViolations);

describe('CCNNonMatchForm Accessibility', () => {
  const mockOnSubmit = jest.fn();
  const mockOnBack = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Form Labels and Associations', () => {
    it('textarea has associated label', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const textarea = screen.getByLabelText(/Provide detailed justification/i);
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveAttribute('id', 'justification-text');
    });

    it('textarea has aria-describedby pointing to hint and error', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const textarea = screen.getByLabelText(/Provide detailed justification/i);
      expect(textarea).toHaveAttribute('aria-describedby', 'justification-hint justification-error');
    });

    it('required fields have visual indicator', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      // Required asterisks should be present (aria-hidden for screen readers)
      const requiredIndicators = screen.getAllByText('*');
      expect(requiredIndicators.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Radio Group Accessibility', () => {
    it('radio group has proper role', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const radioGroup = screen.getByRole('radiogroup');
      expect(radioGroup).toBeInTheDocument();
    });

    it('radio group has aria-required attribute', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const radioGroup = screen.getByRole('radiogroup');
      expect(radioGroup).toHaveAttribute('aria-required', 'true');
    });

    it('each radio option has aria-describedby for description', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      // Check that radio inputs reference their descriptions
      const specializedRadio = document.querySelector('input[value="specialized"]');
      expect(specializedRadio).toHaveAttribute('aria-describedby', 'reason-specialized-description');
    });

    it('all reason options are selectable', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const specializedLabel = screen.getByText('Specialized Course');
      await user.click(specializedLabel);

      const specializedRadio = document.querySelector('input[value="specialized"]') as HTMLInputElement;
      expect(specializedRadio?.checked).toBe(true);
    });
  });

  describe('Error Announcements', () => {
    it('error message has alert role when validation fails', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} minCharacters={20} />);

      const textarea = screen.getByLabelText(/Provide detailed justification/i);

      // Type a short text and blur to trigger validation
      await user.type(textarea, 'Short');
      fireEvent.blur(textarea);

      const errorMessage = screen.getByRole('alert');
      expect(errorMessage).toBeInTheDocument();
      expect(errorMessage).toHaveTextContent(/Please enter at least 20 characters/i);
    });

    it('textarea has aria-invalid when validation fails', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} minCharacters={20} />);

      const textarea = screen.getByLabelText(/Provide detailed justification/i);

      await user.type(textarea, 'Short');
      fireEvent.blur(textarea);

      expect(textarea).toHaveAttribute('aria-invalid', 'true');
    });

    it('error message shows max character exceeded message', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} maxCharacters={50} />);

      const textarea = screen.getByLabelText(/Provide detailed justification/i);

      // Type text exceeding max characters
      await user.type(textarea, 'This is a very long text that exceeds the maximum character limit of 50 characters');
      fireEvent.blur(textarea);

      const errorMessage = screen.getByRole('alert');
      expect(errorMessage).toHaveTextContent(/Maximum 50 characters allowed/i);
    });
  });

  describe('Character Counter', () => {
    it('character counter has aria-live polite', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      // Look for the character counter element
      const charCounter = screen.getByText('0/500');
      expect(charCounter).toHaveAttribute('aria-live', 'polite');
    });

    it('character counter updates as user types', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const textarea = screen.getByLabelText(/Provide detailed justification/i);

      await user.type(textarea, 'Testing character count');

      expect(screen.getByText('23/500')).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation', () => {
    it('can navigate through form with Tab', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      // Tab through the form elements
      await user.tab();

      // First tab should focus a radio option
      const focusedElement = document.activeElement;
      expect(focusedElement?.closest('[role="radiogroup"]')).toBeInTheDocument();
    });

    it('can select radio options with keyboard', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      // Focus the first radio
      await user.tab();

      // Press space to select
      await user.keyboard(' ');

      const specializedRadio = document.querySelector('input[value="specialized"]') as HTMLInputElement;
      expect(specializedRadio?.checked).toBe(true);
    });

    it('Back button is keyboard accessible', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const backButton = screen.getByRole('button', { name: /Back/i });
      backButton.focus();

      await user.keyboard('{Enter}');

      expect(mockOnBack).toHaveBeenCalledTimes(1);
    });

    it('Submit button is keyboard accessible', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      // Fill valid form
      const specializedLabel = screen.getByText('Specialized Course');
      await user.click(specializedLabel);

      const textarea = screen.getByLabelText(/Provide detailed justification/i);
      await user.type(textarea, 'This is a detailed justification explaining why this course does not align with CCN standards.');

      const submitButton = screen.getByRole('button', { name: /Submit Justification/i });
      submitButton.focus();

      await user.keyboard('{Enter}');

      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });
  });

  describe('Button States', () => {
    it('disabled submit button has proper attributes', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const submitButton = screen.getByRole('button', { name: /Submit Justification/i });
      expect(submitButton).toBeDisabled();
    });

    it('enabled submit button when form is valid', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      // Select a reason
      const specializedLabel = screen.getByText('Specialized Course');
      await user.click(specializedLabel);

      // Type valid justification
      const textarea = screen.getByLabelText(/Provide detailed justification/i);
      await user.type(textarea, 'This is a detailed justification explaining why.');

      const submitButton = screen.getByRole('button', { name: /Submit Justification/i });
      expect(submitButton).not.toBeDisabled();
    });

    it('buttons show disabled state during submission', () => {
      render(
        <CCNNonMatchForm
          onSubmit={mockOnSubmit}
          onBack={mockOnBack}
          isSubmitting={true}
        />
      );

      const submitButton = screen.getByRole('button', { name: /Submitting.../i });
      expect(submitButton).toBeDisabled();

      const backButton = screen.getByRole('button', { name: /Back/i });
      expect(backButton).toBeDisabled();
    });
  });

  describe('Warning Banner', () => {
    it('AB 1111 warning banner is present', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      expect(screen.getByText('AB 1111 Compliance Required')).toBeInTheDocument();
      expect(screen.getByText(/Per Assembly Bill 1111/i)).toBeInTheDocument();
    });
  });

  describe('axe-core Automated Checks', () => {
    it('empty form has no a11y violations', async () => {
      const { container } = render(
        <CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('form with selection has no a11y violations', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />
      );

      // Select a reason
      const specializedLabel = screen.getByText('Specialized Course');
      await user.click(specializedLabel);

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('form with valid input has no a11y violations', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />
      );

      // Fill out the form completely
      const specializedLabel = screen.getByText('Specialized Course');
      await user.click(specializedLabel);

      const textarea = screen.getByLabelText(/Provide detailed justification/i);
      await user.type(textarea, 'This is a detailed justification explaining why this course does not align.');

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('form with error state has no a11y violations', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} minCharacters={20} />
      );

      const textarea = screen.getByLabelText(/Provide detailed justification/i);
      await user.type(textarea, 'Short');
      fireEvent.blur(textarea);

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('form in submitting state has no a11y violations', async () => {
      const { container } = render(
        <CCNNonMatchForm
          onSubmit={mockOnSubmit}
          onBack={mockOnBack}
          isSubmitting={true}
        />
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Focus Management', () => {
    it('focus visible styles are applied', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const textarea = screen.getByLabelText(/Provide detailed justification/i);
      expect(textarea.className).toContain('focus:ring-2');
    });
  });
});
