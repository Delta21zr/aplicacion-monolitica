import { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

export default function Catalog() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters state
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  // Fetch categories from Catalog Service
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await axios.get('http://localhost:8081/api/catalog/categories');
        setCategories(res.data || []);
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    fetchCategories();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append('q', search.trim());
      if (selectedCategory) params.append('category', selectedCategory);
      if (brand.trim()) params.append('brand', brand.trim());
      if (minPrice) params.append('minPrice', minPrice);
      if (maxPrice) params.append('maxPrice', maxPrice);
      if (onlyAvailable) params.append('available', 'true');

      const res = await axios.get(`http://localhost:8081/api/catalog/products?${params.toString()}`);
      setProducts(res.data || []);
    } catch (err) {
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, onlyAvailable]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchProducts();
  };

  const handleClearFilters = () => {
    setSearch('');
    setSelectedCategory('');
    setBrand('');
    setMinPrice('');
    setMaxPrice('');
    setOnlyAvailable(false);
    setTimeout(() => {
      fetchProducts();
    }, 0);
  };

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h2>Catálogo y Productos</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Explora nuestro catálogo con búsqueda dinámica y filtros por precio, marca, categoría y disponibilidad.
        </p>
      </div>

      {/* Barra de Filtros Dinámicos */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <form onSubmit={handleSearchSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
            
            {/* 1. Búsqueda por palabra clave */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                Buscar palabras clave
              </label>
              <input 
                type="text" 
                placeholder="Nombre, tags, descripción..." 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
              />
            </div>

            {/* 2. Categoría */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                Categoría
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '14px' }}
              >
                <option value="">Todas las categorías</option>
                {categories.map((c) => (
                  <option key={c.id || c.slug} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Marca */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                Marca
              </label>
              <input 
                type="text" 
                placeholder="Ej. Apple, Sony..." 
                value={brand} 
                onChange={(e) => setBrand(e.target.value)} 
              />
            </div>

            {/* 4. Rango de Precio */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
                Rango de Precio ($)
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="number" 
                  placeholder="Mín" 
                  value={minPrice} 
                  onChange={(e) => setMinPrice(e.target.value)} 
                  style={{ width: '50%' }}
                />
                <input 
                  type="number" 
                  placeholder="Máx" 
                  value={maxPrice} 
                  onChange={(e) => setMaxPrice(e.target.value)} 
                  style={{ width: '50%' }}
                />
              </div>
            </div>

          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '1rem' }}>
            {/* 5. Filtro de Disponibilidad */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>
              <input 
                type="checkbox" 
                checked={onlyAvailable} 
                onChange={(e) => setOnlyAvailable(e.target.checked)} 
                style={{ width: 'auto' }}
              />
              ⚡ Solo productos disponibles (En stock)
            </label>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" onClick={handleClearFilters} style={{ backgroundColor: '#f3f4f6', color: '#374151' }}>
                Limpiar Filtros
              </button>
              <button type="submit">
                Aplicar Filtros
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Grid de Productos */}
      {loading ? (
        <p style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Cargando catálogo...</p>
      ) : (
        <div className="grid">
          {products.map(p => (
            <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span className="badge">{p.category || 'General'}</span>
                {p.in_stock ? (
                  <span className="badge success" style={{ margin: 0 }}>En stock</span>
                ) : (
                  <span className="badge error" style={{ margin: 0 }}>Agotado</span>
                )}
              </div>

              {p.images && p.images.length > 0 ? (
                <img 
                  src={p.images[0]} 
                  alt={p.name} 
                  style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '6px', marginBottom: '1rem' }} 
                />
              ) : (
                <div style={{ backgroundColor: '#f3f4f6', height: '160px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', marginBottom: '1rem' }}>
                  📦 Sin imagen
                </div>
              )}

              <h3 className="card-title" style={{ margin: '0 0 0.25rem 0' }}>{p.name}</h3>
              {p.brand && <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Por {p.brand}</p>}
              <p className="card-price">${p.price.toLocaleString('es-MX')}</p>
              
              <Link to={`/product/${p.id}`} style={{ width: '100%', marginTop: 'auto' }}>
                <button style={{ width: '100%', backgroundColor: '#f3f4f6', color: '#111' }}>
                  Ver Detalle
                </button>
              </Link>
            </div>
          ))}
          {products.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              No se encontraron productos que coincidan con los filtros seleccionados.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
