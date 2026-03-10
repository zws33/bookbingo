import { useState, FormEvent } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { Modal } from './Modal';
import { useToast } from '../lib/ToastContext';

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

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setType('bug');
  };

  const handleClose = () => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await submitFeedbackCallable({ type, title: title.trim(), description: description.trim() });
      showSuccess('Feedback submitted! Thanks for helping improve Book Bingo. 🎉');
      resetForm();
      onClose();
    } catch {
      showError('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Send Feedback">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
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
          <label htmlFor="feedback-title" className="block text-sm font-medium text-gray-700 mb-1">
            Title
          </label>
          <input
            id="feedback-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={
              type === 'bug' ? 'Short summary of the issue' : 'Short summary of the feature'
            }
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label
            htmlFor="feedback-description"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {type === 'bug' ? 'Steps to Reproduce' : 'Description'}
          </label>
          <textarea
            id="feedback-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
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
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 hover:text-gray-900"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isValid || isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
