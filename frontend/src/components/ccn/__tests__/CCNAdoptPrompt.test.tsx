import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CCNAdoptPrompt, CCNAdoptPromptCompact, CCNMatchResult, CCNStandard } from '../CCNAdoptPrompt';

describe('CCNAdoptPrompt', () => {
  const mockMatch: CCNMatchResult = {
    c_id: 'MATH C2210',
    discipline: 'MATH',
    title: 'Calculus I',
    descriptor: 'Introduction to differential and integral calculus',
    minimum_units: 4,
    confidence_score: 0.85,
    match_reasons: ['Subject code match', 'Title similarity', 'Unit requirements met'],
    slo_requirements: ['Apply limits to evaluate functions', 'Compute derivatives'],
    content_requirements: ['Limits and continuity', 'Derivatives', 'Applications of derivatives'],
    alignment_status: 'aligned',
    units_sufficient: true,
  };

  const mockOnAdopt = jest.fn();
  const mockOnDismiss = jest.fn();
  const mockOnViewRequirements = jest.fn();
  const mockOnSearchStandards = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Header and basic info', () => {
    it('renders match found header', () => {
      render(<CCNAdoptPrompt match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

      expect(screen.getByText('C-ID Standard Match Found')).toBeInTheDocument();
    });

    it('shows high match badge for high confidence', () => {
      render(<CCNAdoptPrompt match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

      expect(screen.getByText('High Match')).toBeInTheDocument();
    });

    it('does not show high match badge for low confidence', () => {
      const lowConfidenceMatch = { ...mockMatch, confidence_score: 0.55 };
      render(<CCNAdoptPrompt match={lowConfidenceMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

      expect(screen.queryByText('High Match')).not.toBeInTheDocument();
    });

    it('displays course title when provided', () => {
      render(
        <CCNAdoptPrompt
          match={mockMatch}
          courseTitle="Introduction to Calculus"
          onAdopt={mockOnAdopt}
          onDismiss={mockOnDismiss}
        />
      );

      expect(screen.getByText(/Introduction to Calculus.*matches/)).toBeInTheDocument();
    });

    it('displays C-ID code', () => {
      render(<CCNAdoptPrompt match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

      // C-ID appears in multiple places
      const cIdElements = screen.getAllByText('MATH C2210');
      expect(cIdElements.length).toBeGreaterThan(0);
    });
  });

  describe('Standard info card', () => {
    it('displays standard title', () => {
      render(<CCNAdoptPrompt match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

      expect(screen.getByText('Calculus I')).toBeInTheDocument();
    });

    it('displays discipline', () => {
      render(<CCNAdoptPrompt match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

      expect(screen.getByText('Discipline:')).toBeInTheDocument();
      expect(screen.getByText('MATH')).toBeInTheDocument();
    });

    it('displays minimum units', () => {
      render(<CCNAdoptPrompt match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

      expect(screen.getByText('Min Units:')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
    });

    it('displays confidence score as percentage', () => {
      render(<CCNAdoptPrompt match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

      expect(screen.getByText('85%')).toBeInTheDocument();
      expect(screen.getByText('match confidence')).toBeInTheDocument();
    });

    it('displays match reasons', () => {
      render(<CCNAdoptPrompt match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

      expect(screen.getByText('Subject code match')).toBeInTheDocument();
      expect(screen.getByText('Title similarity')).toBeInTheDocument();
      expect(screen.getByText('Unit requirements met')).toBeInTheDocument();
    });
  });

  describe('Units warning', () => {
    it('shows warning when course units are insufficient', () => {
      const insufficientUnitsMatch = { ...mockMatch, units_sufficient: false };
      render(
        <CCNAdoptPrompt
          match={insufficientUnitsMatch}
          courseUnits={3}
          onAdopt={mockOnAdopt}
          onDismiss={mockOnDismiss}
        />
      );

      expect(screen.getByText(/Your course has 3 units/)).toBeInTheDocument();
      expect(screen.getByText(/minimum of 4 units/)).toBeInTheDocument();
    });

    it('does not show warning when units are sufficient', () => {
      render(
        <CCNAdoptPrompt
          match={mockMatch}
          courseUnits={4}
          onAdopt={mockOnAdopt}
          onDismiss={mockOnDismiss}
        />
      );

      expect(screen.queryByText(/Your course has/)).not.toBeInTheDocument();
    });
  });

  describe('Expandable requirements', () => {
    it('shows toggle button for requirements', () => {
      render(<CCNAdoptPrompt match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

      expect(screen.getByText('View Standard Requirements')).toBeInTheDocument();
    });

    it('expands to show requirements when clicked', async () => {
      const user = userEvent.setup();
      render(<CCNAdoptPrompt match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

      await user.click(screen.getByText('View Standard Requirements'));

      // Should now show hide button
      expect(screen.getByText('Hide Standard Requirements')).toBeInTheDocument();

      // Should show descriptor
      expect(screen.getByText('Standard Description')).toBeInTheDocument();
      expect(screen.getByText('Introduction to differential and integral calculus')).toBeInTheDocument();

      // Should show SLO requirements
      expect(screen.getByText('SLO Requirements')).toBeInTheDocument();
      expect(screen.getByText('Apply limits to evaluate functions')).toBeInTheDocument();

      // Should show content requirements
      expect(screen.getByText('Content Requirements')).toBeInTheDocument();
      expect(screen.getByText('Limits and continuity')).toBeInTheDocument();
    });

    it('collapses requirements when clicked again', async () => {
      const user = userEvent.setup();
      render(<CCNAdoptPrompt match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

      // Expand
      await user.click(screen.getByText('View Standard Requirements'));
      expect(screen.getByText('Standard Description')).toBeInTheDocument();

      // Collapse
      await user.click(screen.getByText('Hide Standard Requirements'));
      expect(screen.queryByText('Standard Description')).not.toBeInTheDocument();
    });
  });

  describe('Action buttons', () => {
    it('renders Adopt Standard button', () => {
      render(<CCNAdoptPrompt match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

      expect(screen.getByText('Adopt Standard')).toBeInTheDocument();
    });

    it('calls onAdopt with standard when Adopt is clicked', async () => {
      const user = userEvent.setup();
      render(<CCNAdoptPrompt match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

      await user.click(screen.getByText('Adopt Standard'));

      expect(mockOnAdopt).toHaveBeenCalledWith({
        c_id: 'MATH C2210',
        discipline: 'MATH',
        title: 'Calculus I',
        descriptor: 'Introduction to differential and integral calculus',
        minimum_units: 4,
        slo_requirements: mockMatch.slo_requirements,
        content_requirements: mockMatch.content_requirements,
      });
    });

    it('renders View Requirements button when onViewRequirements provided', () => {
      render(
        <CCNAdoptPrompt
          match={mockMatch}
          onAdopt={mockOnAdopt}
          onDismiss={mockOnDismiss}
          onViewRequirements={mockOnViewRequirements}
        />
      );

      expect(screen.getByText('View Requirements')).toBeInTheDocument();
    });

    it('calls onViewRequirements when clicked', async () => {
      const user = userEvent.setup();
      render(
        <CCNAdoptPrompt
          match={mockMatch}
          onAdopt={mockOnAdopt}
          onDismiss={mockOnDismiss}
          onViewRequirements={mockOnViewRequirements}
        />
      );

      await user.click(screen.getByText('View Requirements'));

      expect(mockOnViewRequirements).toHaveBeenCalledWith(expect.objectContaining({
        c_id: 'MATH C2210',
      }));
    });

    it('renders Search Other Standards button when onSearchStandards provided', () => {
      render(
        <CCNAdoptPrompt
          match={mockMatch}
          onAdopt={mockOnAdopt}
          onDismiss={mockOnDismiss}
          onSearchStandards={mockOnSearchStandards}
        />
      );

      expect(screen.getByText('Search Other Standards')).toBeInTheDocument();
    });

    it('calls onSearchStandards when clicked', async () => {
      const user = userEvent.setup();
      render(
        <CCNAdoptPrompt
          match={mockMatch}
          onAdopt={mockOnAdopt}
          onDismiss={mockOnDismiss}
          onSearchStandards={mockOnSearchStandards}
        />
      );

      await user.click(screen.getByText('Search Other Standards'));

      expect(mockOnSearchStandards).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dismiss button', () => {
    it('renders dismiss button', () => {
      render(<CCNAdoptPrompt match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

      expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
    });

    it('calls onDismiss when clicked', async () => {
      const user = userEvent.setup();
      render(<CCNAdoptPrompt match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

      await user.click(screen.getByLabelText('Dismiss'));

      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('Adopting state', () => {
    it('shows loading state when isAdopting is true', () => {
      render(
        <CCNAdoptPrompt
          match={mockMatch}
          onAdopt={mockOnAdopt}
          onDismiss={mockOnDismiss}
          isAdopting={true}
        />
      );

      expect(screen.getByText('Adopting...')).toBeInTheDocument();
    });

    it('disables adopt button when isAdopting is true', () => {
      render(
        <CCNAdoptPrompt
          match={mockMatch}
          onAdopt={mockOnAdopt}
          onDismiss={mockOnDismiss}
          isAdopting={true}
        />
      );

      const adoptButton = screen.getByText('Adopting...').closest('button');
      expect(adoptButton).toBeDisabled();
    });
  });
});

describe('CCNAdoptPromptCompact', () => {
  const mockMatch: CCNMatchResult = {
    c_id: 'ENGL C1000',
    discipline: 'ENGL',
    title: 'English Composition',
    minimum_units: 3,
    confidence_score: 0.75,
    match_reasons: ['Title match'],
    slo_requirements: [],
    content_requirements: [],
    alignment_status: 'aligned',
    units_sufficient: true,
  };

  const mockOnAdopt = jest.fn();
  const mockOnDismiss = jest.fn();
  const mockOnViewDetails = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('displays C-ID match', () => {
    render(<CCNAdoptPromptCompact match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

    expect(screen.getByText('C-ID Match: ENGL C1000')).toBeInTheDocument();
  });

  it('displays confidence percentage', () => {
    render(<CCNAdoptPromptCompact match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

    expect(screen.getByText('75% confidence')).toBeInTheDocument();
  });

  it('calls onAdopt when Adopt is clicked', async () => {
    const user = userEvent.setup();
    render(<CCNAdoptPromptCompact match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

    await user.click(screen.getByText('Adopt'));

    expect(mockOnAdopt).toHaveBeenCalledWith(expect.objectContaining({
      c_id: 'ENGL C1000',
    }));
  });

  it('calls onDismiss when dismiss button is clicked', async () => {
    const user = userEvent.setup();
    render(<CCNAdoptPromptCompact match={mockMatch} onAdopt={mockOnAdopt} onDismiss={mockOnDismiss} />);

    await user.click(screen.getByLabelText('Dismiss'));

    expect(mockOnDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders Details button when onViewDetails is provided', () => {
    render(
      <CCNAdoptPromptCompact
        match={mockMatch}
        onAdopt={mockOnAdopt}
        onDismiss={mockOnDismiss}
        onViewDetails={mockOnViewDetails}
      />
    );

    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('calls onViewDetails when Details is clicked', async () => {
    const user = userEvent.setup();
    render(
      <CCNAdoptPromptCompact
        match={mockMatch}
        onAdopt={mockOnAdopt}
        onDismiss={mockOnDismiss}
        onViewDetails={mockOnViewDetails}
      />
    );

    await user.click(screen.getByText('Details'));

    expect(mockOnViewDetails).toHaveBeenCalledTimes(1);
  });

  it('shows loading spinner when isAdopting is true', () => {
    render(
      <CCNAdoptPromptCompact
        match={mockMatch}
        onAdopt={mockOnAdopt}
        onDismiss={mockOnDismiss}
        isAdopting={true}
      />
    );

    // Should not show "Adopt" text when loading
    const adoptButton = screen.getByRole('button', { name: /adopt/i });
    expect(adoptButton).toBeDisabled();
  });
});
