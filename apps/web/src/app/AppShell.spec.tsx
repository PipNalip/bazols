// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { AppShell } from './AppShell.js';

afterEach(cleanup);

function renderShell() {
  return render(
    <MemoryRouter>
      <AppShell user={{ id: 'user-a', username: 'manager', role: 'MANAGER' }} onLogout={() => {}}>
        <h1>Рейтинги</h1>
      </AppShell>
    </MemoryRouter>,
  );
}

describe('AppShell', () => {
  it('renders the textual brand, skip link and manager navigation', () => {
    renderShell();

    expect(screen.getAllByText('Bazols')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Перейти к содержимому' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('link', { name: 'Рейтинги' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Пользователи' })).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('opens and closes accessible mobile navigation', async () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }));
    expect(screen.getByRole('dialog', { name: 'Навигация' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть меню' }));
    expect(screen.queryByRole('dialog', { name: 'Навигация' })).not.toBeInTheDocument();
  });
});
