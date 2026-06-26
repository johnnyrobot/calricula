/**
 * Tests for useFormValidation — the hook that gates course/program form
 * submission. Covers the shared validation rules (required, length, numeric
 * bounds, pattern, email) plus the hook's blur/change/submit lifecycle, since
 * an incorrect validity result here can let invalid curriculum data through.
 */
import { renderHook, act } from '@testing-library/react';
import {
  useFormValidation,
  validationRules,
  type FieldConfigs,
} from '../useFormValidation';

describe('validationRules', () => {
  describe('required', () => {
    const rule = validationRules.required('Title');
    it('rejects empty / whitespace-only values', () => {
      expect(rule.validate('')).toBe('Title is required');
      expect(rule.validate('   ')).toBe('Title is required');
      expect(rule.validate(undefined as never)).toBe('Title is required');
    });
    it('accepts a non-empty value', () => {
      expect(rule.validate('Calculus')).toBeUndefined();
    });
  });

  describe('minLength / maxLength', () => {
    it('enforces a minimum length (trimmed)', () => {
      const rule = validationRules.minLength(3, 'Code');
      expect(rule.validate('ab')).toBe('Code must be at least 3 characters');
      expect(rule.validate('  a ')).toBe('Code must be at least 3 characters');
      expect(rule.validate('abc')).toBeUndefined();
    });
    it('enforces a maximum length (trimmed)', () => {
      const rule = validationRules.maxLength(5, 'Code');
      expect(rule.validate('abcdef')).toBe('Code must be 5 characters or less');
      expect(rule.validate('abcde')).toBeUndefined();
    });
  });

  describe('email', () => {
    const rule = validationRules.email();
    it('rejects malformed addresses', () => {
      expect(rule.validate('not-an-email')).toBe('Please enter a valid email address');
      expect(rule.validate('a@b')).toBe('Please enter a valid email address');
    });
    it('accepts a valid address and ignores empty input', () => {
      expect(rule.validate('user@example.com')).toBeUndefined();
      expect(rule.validate('')).toBeUndefined();
    });
  });

  describe('numeric / min / max', () => {
    it('flags non-numeric input', () => {
      expect(validationRules.numeric('Units').validate('abc')).toBe('Units must be a number');
      expect(validationRules.numeric('Units').validate('4')).toBeUndefined();
    });
    it('enforces a numeric minimum (e.g. unit floor)', () => {
      const rule = validationRules.min(1, 'Units');
      expect(rule.validate('0')).toBe('Units must be at least 1');
      expect(rule.validate('1')).toBeUndefined();
    });
    it('enforces a numeric maximum (e.g. unit ceiling)', () => {
      const rule = validationRules.max(12, 'Units');
      expect(rule.validate('15')).toBe('Units must be at most 12');
      expect(rule.validate('12')).toBeUndefined();
    });
  });

  describe('pattern', () => {
    const rule = validationRules.pattern(/^[A-Z]{2,4}$/, 'Subject must be 2-4 uppercase letters');
    it('rejects values that do not match', () => {
      expect(rule.validate('math')).toBe('Subject must be 2-4 uppercase letters');
    });
    it('accepts matching values and ignores empty input', () => {
      expect(rule.validate('MATH')).toBeUndefined();
      expect(rule.validate('')).toBeUndefined();
    });
  });

  describe('custom', () => {
    it('runs a caller-supplied validator with access to form data', () => {
      const rule = validationRules.custom((value, formData) =>
        value === formData?.confirm ? undefined : 'Values must match'
      );
      expect(rule.validate('a', { confirm: 'b' })).toBe('Values must match');
      expect(rule.validate('a', { confirm: 'a' })).toBeUndefined();
    });
  });
});

// A representative course-form config: a required subject code and a units
// field bounded like a real Title 5 unit range.
const courseConfig = {
  subjectCode: {
    label: 'Subject Code',
    rules: [validationRules.required('Subject Code'), validationRules.pattern(/^[A-Z]{2,4}$/, 'Use 2-4 uppercase letters')],
  },
  units: {
    label: 'Units',
    rules: [validationRules.required('Units'), validationRules.min(0.5, 'Units'), validationRules.max(12, 'Units')],
  },
} satisfies FieldConfigs;

describe('useFormValidation hook', () => {
  it('validateField returns the first failing rule message', () => {
    const { result } = renderHook(() => useFormValidation(courseConfig));
    expect(result.current.validateField('subjectCode', '')).toBe('Subject Code is required');
    expect(result.current.validateField('subjectCode', 'math')).toBe('Use 2-4 uppercase letters');
    expect(result.current.validateField('subjectCode', 'MATH')).toBeUndefined();
  });

  it('validateField returns undefined for an unknown field', () => {
    const { result } = renderHook(() => useFormValidation(courseConfig));
    expect(result.current.validateField('nope' as never, 'x')).toBeUndefined();
  });

  it('validateAll populates errors and reports overall validity', () => {
    const { result } = renderHook(() => useFormValidation(courseConfig));

    let valid = true;
    act(() => {
      valid = result.current.validateAll({ subjectCode: '', units: '20' });
    });
    expect(valid).toBe(false);
    expect(result.current.errors.subjectCode).toBe('Subject Code is required');
    expect(result.current.errors.units).toBe('Units must be at most 12');

    act(() => {
      valid = result.current.validateAll({ subjectCode: 'MATH', units: '4' });
    });
    expect(valid).toBe(true);
    expect(result.current.isValid).toBe(true);
  });

  it('handleBlur marks the field touched and surfaces its error via getFieldProps', () => {
    const { result } = renderHook(() => useFormValidation(courseConfig));

    act(() => {
      result.current.handleBlur('subjectCode', '');
    });

    expect(result.current.touched.subjectCode).toBe(true);
    const props = result.current.getFieldProps('subjectCode');
    expect(props.hasError).toBe(true);
    expect(props.error).toBe('Subject Code is required');
    expect(props.isValid).toBe(false);
  });

  it('does not surface errors for untouched, unsubmitted fields', () => {
    const { result } = renderHook(() => useFormValidation(courseConfig));
    const props = result.current.getFieldProps('subjectCode');
    expect(props.hasError).toBe(false);
    expect(props.error).toBeUndefined();
  });

  it('handleChange re-validates a touched field', () => {
    const { result } = renderHook(() => useFormValidation(courseConfig));

    act(() => {
      result.current.handleBlur('subjectCode', '');
    });
    expect(result.current.errors.subjectCode).toBe('Subject Code is required');

    act(() => {
      result.current.handleChange('subjectCode', 'MATH');
    });
    expect(result.current.errors.subjectCode).toBeUndefined();
  });

  it('handleChange clears a pre-existing error for an untouched field as the user types', () => {
    const { result } = renderHook(() => useFormValidation(courseConfig));

    act(() => {
      result.current.setError('subjectCode', 'Server says bad');
    });
    expect(result.current.errors.subjectCode).toBe('Server says bad');

    // Field is not touched and form not submitted -> typing clears the error.
    act(() => {
      result.current.handleChange('subjectCode', 'M');
    });
    expect(result.current.errors.subjectCode).toBeUndefined();
  });

  it('setSubmitted marks all fields touched so errors show without per-field blur', () => {
    const { result } = renderHook(() => useFormValidation(courseConfig));

    act(() => {
      result.current.setSubmitted();
    });

    expect(result.current.submitted).toBe(true);
    expect(result.current.touched.subjectCode).toBe(true);
    expect(result.current.touched.units).toBe(true);
  });

  it('exposes validationErrors with field labels for the summary component', () => {
    const { result } = renderHook(() => useFormValidation(courseConfig));

    act(() => {
      result.current.validateAll({ subjectCode: '', units: '' });
    });

    const summary = result.current.validationErrors;
    expect(summary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'subjectCode', label: 'Subject Code' }),
        expect.objectContaining({ field: 'units', label: 'Units' }),
      ])
    );
  });

  it('setErrors merges API errors and setError sets a single one', () => {
    const { result } = renderHook(() => useFormValidation(courseConfig));

    act(() => {
      result.current.setErrors({ subjectCode: 'Already exists', units: 'Bad' });
    });
    expect(result.current.errors.subjectCode).toBe('Already exists');
    expect(result.current.isValid).toBe(false);

    act(() => {
      result.current.setError('units', 'Too many');
    });
    expect(result.current.errors.units).toBe('Too many');
  });

  it('clearError / clearAllErrors / reset restore a clean state', () => {
    const { result } = renderHook(() => useFormValidation(courseConfig));

    act(() => {
      result.current.handleBlur('subjectCode', '');
      result.current.handleBlur('units', '');
    });
    expect(result.current.errors.subjectCode).toBeTruthy();

    act(() => {
      result.current.clearError('subjectCode');
    });
    expect(result.current.errors.subjectCode).toBeUndefined();

    act(() => {
      result.current.clearAllErrors();
    });
    expect(result.current.errors.units).toBeUndefined();

    act(() => {
      result.current.handleBlur('units', '');
      result.current.setSubmitted();
      result.current.reset();
    });
    expect(result.current.submitted).toBe(false);
    expect(result.current.touched.units).toBeUndefined();
  });
});
