import React, { useEffect, useState, useRef } from 'react';

/**
 * EncryptedText - A typewriter-style text reveal where characters
 * appear as scrambled/random glyphs before settling into the final text.
 */
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*{}[]<>/*~';

interface EncryptedTextProps {
  text: string;
  encryptedClassName?: string;
  revealedClassName?: string;
  revealDelayMs?: number;
  className?: string;
  [key: string]: unknown;
}

export const EncryptedText = ({
  text,
  encryptedClassName = '',
  revealedClassName = '',
  revealDelayMs = 50,
  className = '',
  ...props
}: EncryptedTextProps) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isRevealed, setIsRevealed] = useState(false);
  const charIndexRef = useRef(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    let startTime: number | null = null;
    const finalText = text;
    charIndexRef.current = 0;

    const revealNext = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const charIndex = Math.min(
        Math.floor(elapsed / revealDelayMs),
        finalText.length
      );

      if (charIndex >= finalText.length) {
        setIsRevealed(true);
        setDisplayedText(finalText);
        return;
      }

      setIsRevealed(false);

      // Build the displayed text: revealed prefix + scrambled suffix
      let result = '';
      for (let i = 0; i < finalText.length; i++) {
        if (i < charIndex) {
          result += finalText[i];
        } else if (i === charIndex) {
          // Current character being revealed: show a random letter briefly
          result += LETTERS[Math.floor(Math.random() * LETTERS.length)];
        } else {
          result += LETTERS[Math.floor(Math.random() * LETTERS.length)];
        }
      }
      setDisplayedText(result);

      intervalRef.current = requestAnimationFrame(revealNext);
    };

    intervalRef.current = requestAnimationFrame(revealNext);

    return () => {
      if (intervalRef.current) {
        cancelAnimationFrame(intervalRef.current);
      }
    };
  }, [text, revealDelayMs]);

  const combinedClassName = `${className} ${isRevealed ? revealedClassName : encryptedClassName}`;

  return (
    <span className={combinedClassName.trim()} {...props}>
      {displayedText}
    </span>
  );
};

export default EncryptedText;
