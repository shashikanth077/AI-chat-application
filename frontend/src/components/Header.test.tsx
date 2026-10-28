import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

function setup(props: Partial<React.ComponentProps<typeof Header>> = {}) {
  const fns = { onToggleDocuments: vi.fn(), onToggleTheme: vi.fn(), onToggleSidebar: vi.fn(), onClear: vi.fn(), onExport: vi.fn(), onAbout: vi.fn() };
  render(
    <Header
      title="Cats and sleep" model="llama-3.3-70b" provider="api.groq.com" useDocuments theme="light" sidebarVisible
      clearDisabled={false} exportDisabled={false} {...fns} {...props}
    />,
  );
  return fns;
}

describe('Header', () => {
  it('shows the chat title and the model that is answering', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Cats and sleep' })).toBeInTheDocument();
    expect(screen.getByText('llama-3.3-70b')).toHaveAttribute('title', 'Served by api.groq.com');
  });

  it('shows no model chip when the server could not say', () => {
    setup({ model: null, provider: null });
    expect(screen.queryByText('llama-3.3-70b')).not.toBeInTheDocument();
  });

  it('the documents switch reports its state and toggles', async () => {
    const f = setup({ useDocuments: true });
    const toggle = screen.getByRole('switch', { name: /Use my documents/ });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(toggle);
    expect(f.onToggleDocuments).toHaveBeenCalledWith(false);
  });

  it('labels the theme button for the theme you would switch TO', async () => {
    const f = setup({ theme: 'dark' });
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(f.onToggleTheme).toHaveBeenCalledOnce();
  });

  it('toggles the sidebar and reports whether it is visible', async () => {
    const f = setup({ sidebarVisible: false });
    const button = screen.getByRole('button', { name: 'Toggle sidebar' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    expect(f.onToggleSidebar).toHaveBeenCalledOnce();
  });

  it('Clear chat can be disabled', () => {
    setup({ clearDisabled: true });
    expect(screen.getByRole('button', { name: 'Clear chat' })).toBeDisabled();
  });

  it('the more-menu holds Export and About, opens by keyboard, and closes on Escape', async () => {
    const f = setup();
    const trigger = screen.getByRole('button', { name: 'More actions' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await userEvent.click(trigger);
    expect(screen.getByRole('menuitem', { name: /Export chat/ })).toHaveFocus(); // focus moves into the menu
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /About/ })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus(); // and focus returns to the button
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('menuitem', { name: /Export chat/ }));
    expect(f.onExport).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Export is disabled in the menu when there is nothing to export', async () => {
    setup({ exportDisabled: true });
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: /Export chat/ })).toBeDisabled();
  });

  it('closes the menu when you click elsewhere', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
