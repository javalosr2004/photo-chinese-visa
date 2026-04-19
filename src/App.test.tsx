import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

describe('App', () => {
  it('switches between camera and upload without leaving the page', () => {
    render(<App />);

    expect(screen.getByRole('tab', { name: 'Camera' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    expect(screen.getByRole('tab', { name: 'Upload' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows framing guidance warnings before a photo is loaded', () => {
    render(<App />);

    expect(screen.getByText(/Align the crown to the top band/i)).toBeInTheDocument();
  });

  it('disables export until a source image exists', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /Export 420 × 560 JPEG/i })).toBeDisabled();
  });

  it('renders upload input in upload mode', () => {
    vi.stubGlobal('navigator', {
      mediaDevices: undefined,
    });

    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Upload' }));

    expect(screen.getByLabelText(/Choose a photo/i)).toBeInTheDocument();
  });
});
