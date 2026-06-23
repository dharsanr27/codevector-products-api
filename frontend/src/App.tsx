import { useState, useEffect } from 'react';

interface Product {
  id: string;
  name: string;
  category: string;
  price: string;
  created_at: string;
  updated_at: string;
}

interface ApiResponse {
  data: Product[];
  nextCursor: string | null;
}

export default function App() {
  // Search & Filter State
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [limit, setLimit] = useState(20);

  // Pagination State (History Stack for Keyset Pagination)
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  // API Data & UI State
  const [products, setProducts] = useState<Product[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce search query to prevent hammering the database on every keystroke
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);

    return () => clearTimeout(handler);
  }, [search]);

  // Reset pagination history back to start whenever any filter or limit changes
  useEffect(() => {
    setCursorHistory([null]);
    setCurrentPageIndex(0);
  }, [debouncedSearch, category, limit]);

  // Fetch products from backend
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      setError(null);
      
      const activeCursor = cursorHistory[currentPageIndex];
      let url = `/api/products?limit=${limit}`;
      
      if (category !== 'all') {
        url += `&category=${encodeURIComponent(category)}`;
      }
      if (debouncedSearch) {
        url += `&q=${encodeURIComponent(debouncedSearch)}`;
      }
      if (activeCursor) {
        url += `&cursor=${encodeURIComponent(activeCursor)}`;
      }

      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`API returned error status: ${response.status}`);
        }
        const result: ApiResponse = await response.json();
        
        setProducts(result.data);
        setNextCursor(result.nextCursor);
      } catch (err: any) {
        console.error('Fetch error:', err);
        setError(err.message || 'Failed to retrieve products from database');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [currentPageIndex, cursorHistory, debouncedSearch, category, limit]);

  // Pagination Handlers
  const handleNextPage = () => {
    if (!nextCursor || loading) return;
    
    if (currentPageIndex + 1 < cursorHistory.length) {
      setCurrentPageIndex(prev => prev + 1);
    } else {
      setCursorHistory(prev => [...prev, nextCursor]);
      setCurrentPageIndex(prev => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPageIndex === 0 || loading) return;
    setCurrentPageIndex(prev => prev - 1);
  };

  // Helper to format timestamps
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="container">
      <h1>Product Catalog</h1>

      {/* Filter Options */}
      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="search-input">Search Product:</label>
          <input
            id="search-input"
            type="text"
            className="filter-input"
            placeholder="Type name to search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="category-select">Category:</label>
          <select
            id="category-select"
            className="filter-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All Categories</option>
            <option value="electronics">Electronics</option>
            <option value="books">Books</option>
            <option value="toys">Toys</option>
            <option value="home">Home</option>
            <option value="sports">Sports</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="limit-select">Show:</label>
          <select
            id="limit-select"
            className="filter-select"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            <option value={10}>10 items</option>
            <option value={20}>20 items</option>
            <option value={50}>50 items</option>
            <option value={100}>100 items</option>
          </select>
        </div>
      </div>

      {/* Error Message Alert */}
      {error && <div className="error-message">Error: {error}</div>}

      {/* Table Data Section */}
      {loading ? (
        <div className="loading-indicator">Loading products from database...</div>
      ) : products.length === 0 ? (
        <div className="empty-state">No products found. Try adjusting your search query or filters.</div>
      ) : (
        <div className="product-table-wrapper">
          <table className="product-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>{product.id}</td>
                  <td>{product.name}</td>
                  <td>
                    <span className={`product-tag ${product.category}`}>
                      {product.category}
                    </span>
                  </td>
                  <td>${parseFloat(product.price).toFixed(2)}</td>
                  <td>{formatDate(product.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      <div className="pagination">
        <button
          className="pagination-btn"
          onClick={handlePrevPage}
          disabled={currentPageIndex === 0 || loading}
        >
          &larr; Previous
        </button>

        <span className="page-info">
          Page {currentPageIndex + 1}
        </span>

        <button
          className="pagination-btn"
          onClick={handleNextPage}
          disabled={!nextCursor || loading}
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}
