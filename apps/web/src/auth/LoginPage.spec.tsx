// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoginPage } from './LoginPage.js';

afterEach(cleanup);

describe('LoginPage', () => {
  it('submits labelled credentials and disables repeated submission', async () => {
    let resolveLogin: (() => void) | undefined;
    const onLogin = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLogin = resolve;
        }),
    );
    render(<LoginPage onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText(/Логин/), { target: { value: 'manager' } });
    fireEvent.change(screen.getByLabelText(/Пароль/), {
      target: { value: 'synthetic-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(onLogin).toHaveBeenCalledWith('manager', 'synthetic-password');
    expect(screen.getByRole('button', { name: 'Входим…' })).toBeDisabled();
    resolveLogin?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Войти' })).toBeEnabled());
  });

  it('shows an explicit message after session expiry', () => {
    render(<LoginPage onLogin={vi.fn()} sessionExpired />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Сессия истекла. Войдите снова, чтобы продолжить.',
    );
  });

  it('shows one generic accessible error for invalid credentials', async () => {
    const onLogin = vi.fn(async () => {
      throw new Error('AUTH_INVALID_CREDENTIALS');
    });
    render(<LoginPage onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText(/Логин/), { target: { value: 'manager' } });
    fireEvent.change(screen.getByLabelText(/Пароль/), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось войти. Проверьте логин и пароль.',
    );
  });
});
