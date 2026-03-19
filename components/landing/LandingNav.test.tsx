import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import LandingNav from './LandingNav'

describe('LandingNav', () => {
  it('renders logo linking to home', () => {
    render(<LandingNav />)
    const logo = screen.getByAltText('Docket')
    expect(logo.closest('a')).toHaveAttribute('href', '/')
  })

  it('renders Log In link to /login', () => {
    render(<LandingNav />)
    const loginLink = screen.getByRole('link', { name: /log in/i })
    expect(loginLink).toHaveAttribute('href', '/login')
  })

  it('renders Get Started Free button linking to /signup', () => {
    render(<LandingNav />)
    const cta = screen.getByRole('link', { name: /get started free/i })
    expect(cta).toHaveAttribute('href', '/signup')
  })

  it('toggles mobile menu on hamburger click', () => {
    render(<LandingNav />)
    const hamburger = screen.getByRole('button', { name: /menu/i })
    expect(screen.queryByTestId('mobile-menu')).not.toBeInTheDocument()
    fireEvent.click(hamburger)
    expect(screen.getByTestId('mobile-menu')).toBeInTheDocument()
    fireEvent.click(hamburger)
    expect(screen.queryByTestId('mobile-menu')).not.toBeInTheDocument()
  })

  it('closes mobile menu on Escape key', () => {
    render(<LandingNav />)
    const hamburger = screen.getByRole('button', { name: /menu/i })
    fireEvent.click(hamburger)
    expect(screen.getByTestId('mobile-menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('mobile-menu')).not.toBeInTheDocument()
  })
})
