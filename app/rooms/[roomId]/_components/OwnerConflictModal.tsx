export default function OwnerConflictModal({ isVisible, roomOwner }) {
    if (!isVisible) return null;
  
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md mx-4">
          <h2 className="text-xl font-bold text-red-600 mb-4">Access Denied</h2>
          <p className="text-gray-700 mb-4">
            The room owner ({roomOwner}) is already active on another device. 
            Only one device can be logged in as the owner at a time.
          </p>
          <button 
            onClick={() => window.location.href = '/'}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
          >
            Go Back to Home
          </button>
        </div>
      </div>
    );
  }