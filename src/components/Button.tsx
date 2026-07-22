import type { ButtonHTMLAttributes, JSX } from 'react'
import styles from './Button.module.scss'

type Variant = 'primary' | 'ghost' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant
}

export function Button({
    variant = 'primary',
    className,
    type = 'button',
    ...props
}: ButtonProps): JSX.Element {
    const variantClass =
        variant === 'ghost' ? styles.ghost : variant === 'icon' ? styles.icon : styles.primary
    const classes = [styles.button, variantClass, className].filter(Boolean).join(' ')
    return <button type={type} className={classes} {...props} />
}
