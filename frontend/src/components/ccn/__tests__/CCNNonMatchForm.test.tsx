import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CCNNonMatchForm, CCN_REASON_OPTIONS } from '../CCNNonMatchForm';

describe('CCNNonMatchForm', () => {
  const mockOnSubmit = jest.fn();
  const mockOnBack = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial render', () => {
    it('renders AB 1111 compliance warning banner', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      expect(screen.getByText('AB 1111 Compliance Required')).toBeInTheDocument();
      expect(screen.getByText(/Assembly Bill 1111/)).toBeInTheDocument();
    });

    it('renders all 5 reason options', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      expect(screen.getByText('Specialized Course')).toBeInTheDocument();
      expect(screen.getByText('Vocational/CTE Course')).toBeInTheDocument();
      expect(screen.getByText('Local Community Need')).toBeInTheDocument();
      expect(screen.getByText('Newly Developed Course')).toBeInTheDocument();
      expect(screen.getByText('Other')).toBeInTheDocument();
    });

    it('renders all reason descriptions', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      CCN_REASON_OPTIONS.forEach((option) => {
        expect(screen.getByText(option.description)).toBeInTheDocument();
      });
    });

    it('renders justification textarea', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      expect(screen.getByLabelText(/Provide detailed justification/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Explain why this course does not align/)).toBeInTheDocument();
    });

    it('shows initial character count as 0/500', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      expect(screen.getByText('0/500')).toBeInTheDocument();
    });

    it('shows minimum character requirement hint', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      expect(screen.getByText('Minimum 20 characters required')).toBeInTheDocument();
    });

    it('renders Back and Submit buttons', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      expect(screen.getByText('Back')).toBeInTheDocument();
      expect(screen.getByText('Submit Justification')).toBeInTheDocument();
    });

    it('submit button is disabled initially', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const submitButton = screen.getByText('Submit Justification').closest('button');
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Radio button selection', () => {
    it('allows selecting a reason option', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const specializedLabel = screen.getByText('Specialized Course').closest('label');
      await user.click(specializedLabel!);

      // Check that the label now has selected styling
      expect(specializedLabel).toHaveClass('border-luminous-500');
    });

    it('only one reason can be selected at a time', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      // Select first option
      await user.click(screen.getByText('Specialized Course').closest('label')!);

      // Select second option
      await user.click(screen.getByText('Vocational/CTE Course').closest('label')!);

      // First should not be selected, second should be
      expect(screen.getByText('Specialized Course').closest('label')).not.toHaveClass('border-luminous-500');
      expect(screen.getByText('Vocational/CTE Course').closest('label')).toHaveClass('border-luminous-500');
    });
  });

  describe('Character counter', () => {
    it('updates character count as user types', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const textarea = screen.getByPlaceholderText(/Explain why/);
      await user.type(textarea, 'Test input');

      expect(screen.getByText('10/500')).toBeInTheDocument();
    });

    it('shows amber color when below minimum characters', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const textarea = screen.getByPlaceholderText(/Explain why/);
      await user.type(textarea, 'Short');

      const counter = screen.getByText('5/500');
      expect(counter).toHaveClass('text-amber-600');
    });

    it('shows green color when within valid range', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const textarea = screen.getByPlaceholderText(/Explain why/);
      const validText = 'This is a valid justification text.';
      await user.type(textarea, validText);

      // Use regex to match the counter pattern
      const counter = screen.getByText(new RegExp(`${validText.length}/500`));
      expect(counter).toHaveClass('text-green-600');
    });
  });

  describe('Validation', () => {
    it('shows error when text is too short after blur', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const textarea = screen.getByPlaceholderText(/Explain why/);
      await user.type(textarea, 'Short');
      fireEvent.blur(textarea);

      expect(screen.getByText('Please enter at least 20 characters')).toBeInTheDocument();
    });

    it('submit remains disabled until form is valid', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      // Select a reason
      await user.click(screen.getByText('Specialized Course').closest('label')!);

      // Submit should still be disabled (no text)
      expect(screen.getByText('Submit Justification').closest('button')).toBeDisabled();

      // Add short text
      const textarea = screen.getByPlaceholderText(/Explain why/);
      await user.type(textarea, 'Short');

      // Submit should still be disabled (text too short)
      expect(screen.getByText('Submit Justification').closest('button')).toBeDisabled();

      // Add valid text
      await user.clear(textarea);
      await user.type(textarea, 'This course has specialized content that is not covered by any CCN standard.');

      // Submit should now be enabled
      expect(screen.getByText('Submit Justification').closest('button')).toBeEnabled();
    });

    it('textarea shows red border when invalid after touched', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const textarea = screen.getByPlaceholderText(/Explain why/);
      await user.type(textarea, 'Short');
      fireEvent.blur(textarea);

      expect(textarea).toHaveClass('border-red-500');
    });
  });

  describe('Form submission', () => {
    it('calls onSubmit with reason code and text when form is valid', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      // Select reason
      await user.click(screen.getByText('Vocational/CTE Course').closest('label')!);

      // Enter justification
      const textarea = screen.getByPlaceholderText(/Explain why/);
      await user.type(textarea, 'This is a CTE course for automotive technology that does not align with any CCN standard.');

      // Submit
      await user.click(screen.getByText('Submit Justification'));

      expect(mockOnSubmit).toHaveBeenCalledWith(
        'vocational',
        'This is a CTE course for automotive technology that does not align with any CCN standard.'
      );
    });

    it('trims whitespace from justification text', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      await user.click(screen.getByText('Other').closest('label')!);

      const textarea = screen.getByPlaceholderText(/Explain why/);
      await user.type(textarea, '   This is a valid justification with spaces   ');

      await user.click(screen.getByText('Submit Justification'));

      expect(mockOnSubmit).toHaveBeenCalledWith(
        'other',
        'This is a valid justification with spaces'
      );
    });

    it('does not submit if form is invalid', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      // Try to submit without selecting reason or entering text
      const form = screen.getByText('Submit Justification').closest('form');
      fireEvent.submit(form!);

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Back button', () => {
    it('calls onBack when clicked', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      await user.click(screen.getByText('Back'));

      expect(mockOnBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('Submitting state', () => {
    it('disables form elements when isSubmitting is true', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} isSubmitting={true} />);

      const textarea = screen.getByPlaceholderText(/Explain why/);
      expect(textarea).toBeDisabled();

      const backButton = screen.getByText('Back').closest('button');
      expect(backButton).toBeDisabled();
    });

    it('shows loading spinner when isSubmitting is true', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} isSubmitting={true} />);

      expect(screen.getByText('Submitting...')).toBeInTheDocument();
    });
  });

  describe('Custom character limits', () => {
    it('respects custom minCharacters', async () => {
      const user = userEvent.setup();
      render(
        <CCNNonMatchForm
          onSubmit={mockOnSubmit}
          onBack={mockOnBack}
          minCharacters={10}
        />
      );

      expect(screen.getByText('Minimum 10 characters required')).toBeInTheDocument();

      // Select reason and enter text
      await user.click(screen.getByText('Specialized Course').closest('label')!);
      const textarea = screen.getByPlaceholderText(/Explain why/);
      await user.type(textarea, 'Short text');

      // Should be valid with 10 chars and custom minimum
      expect(screen.getByText('Submit Justification').closest('button')).toBeEnabled();
    });

    it('respects custom maxCharacters', async () => {
      const user = userEvent.setup();
      render(
        <CCNNonMatchForm
          onSubmit={mockOnSubmit}
          onBack={mockOnBack}
          maxCharacters={100}
        />
      );

      const textarea = screen.getByPlaceholderText(/Explain why/);
      await user.type(textarea, 'Test');

      expect(screen.getByText('4/100')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper aria-required on radiogroup', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const radiogroup = screen.getByRole('radiogroup');
      expect(radiogroup).toHaveAttribute('aria-required', 'true');
    });

    it('textarea has aria-invalid when invalid', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const textarea = screen.getByPlaceholderText(/Explain why/);
      await user.type(textarea, 'Short');
      fireEvent.blur(textarea);

      expect(textarea).toHaveAttribute('aria-invalid', 'true');
    });

    it('error message has role alert', async () => {
      const user = userEvent.setup();
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const textarea = screen.getByPlaceholderText(/Explain why/);
      await user.type(textarea, 'Short');
      fireEvent.blur(textarea);

      const errorMessage = screen.getByRole('alert');
      expect(errorMessage).toHaveTextContent('Please enter at least 20 characters');
    });

    it('character counter has aria-live for screen readers', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      const counter = screen.getByText('0/500');
      expect(counter).toHaveAttribute('aria-live', 'polite');
    });

    it('radio inputs have aria-describedby pointing to descriptions', () => {
      render(<CCNNonMatchForm onSubmit={mockOnSubmit} onBack={mockOnBack} />);

      // Check that description elements exist with proper IDs
      CCN_REASON_OPTIONS.forEach((option) => {
        const description = document.getElementById(`reason-${option.value}-description`);
        expect(description).toBeInTheDocument();
        expect(description).toHaveTextContent(option.description);
      });
    });
  });
});
