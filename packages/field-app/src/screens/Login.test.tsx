import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Login } from './Login';

describe('Login screen render smoke (FS-B1-04)', () => {
  it('renders the email magic-link entry without crashing', () => {
    // No `?code=` in the jsdom URL, so the LINE-callback effect returns early
    // and the screen paints its default email sign-in UI.
    render(<Login />);
    expect(screen.getByText('ส่งลิงก์เข้าอีเมล')).toBeInTheDocument();
    expect(screen.getByText('เข้าด้วย LINE')).toBeInTheDocument();
  });
});
