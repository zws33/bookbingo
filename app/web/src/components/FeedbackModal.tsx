import { useState, useCallback, SubmitEvent } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { useToast } from '../lib/ToastContext';
import { Input, Label, Button, Dialog, Textarea } from './ui/index.js';

type FeedbackType = 'bug' | 'feature';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const submitFeedbackCallable = httpsCallable(functions, 'submitFeedback');

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showSuccess, showError } = useToast();

  const isValid = title.trim().length > 0 && description.trim().length > 0;

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setType('bug');
  }, []);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  }, [isSubmitting, resetForm, onClose]);

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await submitFeedbackCallable({
        type,
        title: title.trim(),
        description: description.trim(),
      });
      showSuccess(
        'Feedback submitted! Thanks for helping improve Book Bingo. 🎉',
      );
      resetForm();
      onClose();
    } catch (err) {
      console.error('[FeedbackModal] submit error:', err);
      showError('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} title="Send Feedback">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label className="mb-1">Type</Label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="feedbackType"
                value="bug"
                checked={type === 'bug'}
                onChange={() => setType('bug')}
                disabled={isSubmitting}
                className="text-blue-600"
              />
              <span className="text-sm text-gray-700">🐛 Bug Report</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="feedbackType"
                value="feature"
                checked={type === 'feature'}
                onChange={() => setType('feature')}
                disabled={isSubmitting}
                className="text-blue-600"
              />
              <span className="text-sm text-gray-700">✨ Feature Request</span>
            </label>
          </div>
        </div>

        <div>
          <Label htmlFor="feedback-title" className="mb-1">
            Title
          </Label>
          <Input
            id="feedback-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              type === 'bug'
                ? 'Short summary of the issue'
                : 'Short summary of the feature'
            }
            disabled={isSubmitting}
          />
        </div>

        <div>
          <Label htmlFor="feedback-description" className="mb-1">
            {type === 'bug' ? 'Steps to Reproduce' : 'Description'}
          </Label>
          <Textarea
            id="feedback-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              type === 'bug'
                ? 'What happened? What did you expect to happen?'
                : 'Describe the feature and how it would help you.'
            }
            rows={4}
            disabled={isSubmitting}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!isValid || isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
