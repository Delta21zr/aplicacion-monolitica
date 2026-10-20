import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [stock, setStock] = useState(null);
  const [error, setError] = useState(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Reviews & Wishlists state (Interaction Service :8086)
  const [reviewsData, setReviewsData] = useState({ average_rating: 0, total_reviews: 0, reviews: [] });
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewMsg, setReviewMsg] = useState('');
  const [wishlistMsg, setWishlistMsg] = useState('');

  const getCurrentUserId = () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return String(payload.id);
      } catch (e) {}
    }
    return "guest-123";
  };

  const fetchReviews = async () => {
    try {
      const res = await axios.get(`http://localhost:8086/api/interactions/reviews/product/${id}`);
      setReviewsData(res.data || { average_rating: 0, total_reviews: 0, reviews: [] });
    } catch (err) {
      console.error("Error cargando reseñas:", err);
    }
  };

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const prodRes = await axios.get(`http://localhost:8081/api/catalog/products/${id}`);
        setProduct(prodRes.data);

        // Fetch real-time stock from inventory service
        const invRes = await axios.get(`http://localhost:8082/api/inventory/${id}`);
        setStock(invRes.data.stock);
      } catch (err) {
        console.error(err);
        setError('Error cargando los detalles del producto o inventario.');
      }
    };
    fetchDetail();
    fetchReviews();
  }, [id]);

  const handleAddToCart = async () => {
    setAdding(true);
    setSuccessMsg('');
    const userId = getCurrentUserId();

    try {
      // Secure Cart payload: Do NOT send price from frontend!
      await axios.post(`http://localhost:8083/api/cart/${userId}`, {
        productId: product.id,
        quantity: quantity,
      });
      setSuccessMsg(`¡${quantity} unidad(es) agregada(s) al carrito exitosamente!`);
    } catch (err) {
      console.error(err);
      setError('Error al agregar al carrito.');
    } finally {
      setAdding(false);
      setTimeout(() => setSuccessMsg(''), 3500);
    }
  };

  // Agregar a Lista de Deseos (Wishlist) en Interaction Service (:8086)
  const handleAddToWishlist = async () => {
    setWishlistMsg('');
    const userId = getCurrentUserId();
    try {
      const listRes = await axios.get(`http://localhost:8086/api/interactions/wishlists/user/${userId}`);
      let wishlists = listRes.data || [];
      let targetWishlistId;

      if (wishlists.length === 0) {
        const createRes = await axios.post('http://localhost:8086/api/interactions/wishlists', {
          user_id: userId,
          name: 'Mis Favoritos',
          is_public: true,
        });
        targetWishlistId = createRes.data.wishlist_id;
      } else {
        targetWishlistId = wishlists[0].id;
      }

      await axios.post(`http://localhost:8086/api/interactions/wishlists/${targetWishlistId}/items`, {
        product_id: product.id,
        notes: `${product.name} ($${product.price})`,
      });
      setWishlistMsg('❤️ Agregado a tu Wishlist (puedes verla y compartirla desde Mi Perfil)');
      setTimeout(() => setWishlistMsg(''), 4000);
    } catch (err) {
      console.error(err);
      setWishlistMsg('Error al guardar en Wishlist');
    }
  };

  // Publicar Reseña con validación de Comprador Verificado (:8086)
  const handleCreateReview = async (e) => {
    e.preventDefault();
    setReviewMsg('');
    const userId = getCurrentUserId();
    try {
      const res = await axios.post('http://localhost:8086/api/interactions/reviews', {
        product_id: product.id,
        user_id: userId,
        rating: Number(reviewRating),
        title: reviewTitle,
        comment: reviewComment,
      });
      const verifiedText = res.data.is_verified_buyer
        ? '✅ ¡Publicada como Comprador Verificado!'
        : 'Publicada (Sin compra previa registrada para este usuario)';
      setReviewMsg(`Reseña registrada: ${verifiedText}`);
      setReviewTitle('');
      setReviewComment('');
      fetchReviews();
    } catch (err) {
      setReviewMsg(err.response?.data?.error || 'Error al publicar reseña');
    }
  };

  if (error) return <p style={{ color: 'var(--error-color)', textAlign: 'center', marginTop: '4rem' }}>{error}</p>;
  if (!product) return <p style={{ textAlign: 'center', marginTop: '4rem', color: 'var(--text-muted)' }}>Cargando información...</p>;

  const images = product.images && product.images.length > 0 ? product.images : [];

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto' }}>
      <Link to="/" style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '1.5rem', display: 'inline-block' }}>
        ← Volver al catálogo
      </Link>
      
      <div className="card" style={{ padding: '2.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem' }}>
          
          {/* Galería de Imágenes */}
          <div>
            <div style={{ backgroundColor: '#f9fafb', height: '320px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
              {images.length > 0 ? (
                <img 
                  src={images[selectedImage] || images[0]} 
                  alt={product.name} 
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                />
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '18px' }}>🖼️ Sin imagen disponible</span>
              )}
            </div>

            {/* Miniaturas de la galería */}
            {images.length > 1 && (
              <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto' }}>
                {images.map((imgUrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedImage(idx)}
                    style={{
                      padding: 0,
                      width: '60px',
                      height: '60px',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      border: selectedImage === idx ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                      backgroundColor: '#fff',
                    }}
                  >
                    <img src={imgUrl} alt={`Thumbnail ${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Información del Producto */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
              <span className="badge" style={{ margin: 0 }}>{product.category || 'General'}</span>
              {product.subcategory && <span className="badge" style={{ margin: 0, backgroundColor: '#e5e7eb' }}>{product.subcategory}</span>}
              {reviewsData.total_reviews > 0 && (
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#d97706', marginLeft: 'auto' }}>
                  ⭐ {reviewsData.average_rating} ({reviewsData.total_reviews} reseña{reviewsData.total_reviews > 1 ? 's' : ''})
                </span>
              )}
            </div>

            <h1 style={{ fontSize: '1.8rem', margin: '0.5rem 0' }}>{product.name}</h1>
            {product.brand && <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Marca: <strong>{product.brand}</strong></p>}
            
            <h2 style={{ fontSize: '1.8rem', fontWeight: '600', marginBottom: '1.5rem', color: '#111827' }}>
              ${product.price.toLocaleString('es-MX')}
            </h2>
            
            {/* Descripción Larga */}
            <p style={{ lineHeight: '1.7', color: '#4b5563', marginBottom: '1.5rem' }}>
              {product.description}
            </p>

            {/* Tags / Etiquetas */}
            {product.tags && product.tags.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                {product.tags.map((tag, i) => (
                  <span key={i} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#f3f4f6', color: '#4b5563' }}>
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            
            {/* Control de Inventario en Tiempo Real */}
            <div style={{ padding: '1rem 1.25rem', backgroundColor: '#f9fafb', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase' }}>
                Stock en Tiempo Real
              </p>
              {stock !== null ? (
                stock > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success-color)', fontWeight: '600', fontSize: '14px' }}>
                    <span style={{ width: '8px', height: '8px', backgroundColor: 'var(--success-color)', borderRadius: '50%' }}></span>
                    Disponible ({stock} unidades en almacén)
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--error-color)', fontWeight: '600', fontSize: '14px' }}>
                    <span style={{ width: '8px', height: '8px', backgroundColor: 'var(--error-color)', borderRadius: '50%' }}></span>
                    Agotado temporalmente
                  </div>
                )
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Consultando inventario...</p>
              )}
            </div>

            {/* Selector de Cantidad y Agregar al Carrito */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                <button
                  type="button"
                  disabled={quantity <= 1 || stock === 0}
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  style={{ backgroundColor: '#f3f4f6', color: '#111', padding: '0.6rem 0.9rem', borderRadius: 0 }}
                >
                  -
                </button>
                <span style={{ padding: '0 1rem', fontWeight: '600', minWidth: '40px', textAlign: 'center' }}>
                  {quantity}
                </span>
                <button
                  type="button"
                  disabled={quantity >= (stock || 1) || stock === 0}
                  onClick={() => setQuantity(quantity + 1)}
                  style={{ backgroundColor: '#f3f4f6', color: '#111', padding: '0.6rem 0.9rem', borderRadius: 0 }}
                >
                  +
                </button>
              </div>

              <button 
                style={{ flexGrow: 1, padding: '0.8rem', fontSize: '15px' }} 
                disabled={stock === 0 || stock === null || adding}
                onClick={handleAddToCart}
              >
                {adding ? 'Agregando...' : (stock > 0 ? '🛒 Agregar al Carrito' : 'Agotado')}
              </button>

              <button
                type="button"
                onClick={handleAddToWishlist}
                title="Guardar en Lista de Deseos (Wishlist)"
                style={{ padding: '0.8rem 1rem', backgroundColor: '#fce7f3', color: '#be185d', fontSize: '15px' }}
              >
                ❤️ Wishlist
              </button>
            </div>
            
            {successMsg && (
              <p style={{ color: 'var(--success-color)', marginTop: '0.75rem', fontWeight: '500', textAlign: 'center', fontSize: '14px' }}>
                {successMsg}
              </p>
            )}
            {wishlistMsg && (
              <p style={{ color: '#be185d', marginTop: '0.75rem', fontWeight: '500', textAlign: 'center', fontSize: '13px' }}>
                {wishlistMsg}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Especificaciones Técnicas */}
      {product.specifications && Object.keys(product.specifications).length > 0 && (
        <div className="card" style={{ padding: '2rem', marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Especificaciones Técnicas
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <tbody>
              {Object.entries(product.specifications).map(([key, val], idx) => (
                <tr key={key} style={{ backgroundColor: idx % 2 === 0 ? '#f9fafb' : '#fff' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: '600', width: '35%', borderBottom: '1px solid var(--border-color)', color: '#374151' }}>
                    {key}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', color: '#4b5563' }}>
                    {val}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sistema de Reseñas y Calificaciones (Interaction Service :8086) */}
      <div className="card" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>⭐ Reseñas y Calificaciones de Clientes</h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
              Validación automática de "Comprador Verificado" contra el historial de órdenes (:8084).
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: '700', color: '#d97706' }}>
              ★ {reviewsData.average_rating || '0.0'} / 5
            </span>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
              {reviewsData.total_reviews} calificación(es)
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '2rem', alignItems: 'flex-start' }}>
          {/* Lista de reseñas */}
          <div>
            {reviewsData.reviews && reviewsData.reviews.length > 0 ? (
              reviewsData.reviews.map((rev) => (
                <div key={rev.id} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '1rem', backgroundColor: '#f9fafb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ color: '#d97706', fontWeight: '700' }}>
                      {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                    </span>
                    {rev.is_verified_buyer ? (
                      <span className="badge success" style={{ margin: 0, fontSize: '11px' }}>
                        ✅ Comprador Verificado
                      </span>
                    ) : (
                      <span className="badge" style={{ margin: 0, fontSize: '11px' }}>
                        Usuario #{rev.user_id}
                      </span>
                    )}
                  </div>
                  <h4 style={{ margin: '0 0 0.3rem 0', fontSize: '15px' }}>{rev.title}</h4>
                  <p style={{ margin: 0, fontSize: '14px', color: '#4b5563' }}>{rev.comment}</p>
                  <p style={{ margin: '0.4rem 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(rev.created_at).toLocaleString('es-MX')}
                  </p>
                </div>
              ))
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                Aún no hay reseñas para este producto. ¡Sé el primero en opinar!
              </p>
            )}
          </div>

          {/* Formulario para escribir reseña */}
          <div style={{ padding: '1.25rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            <h4 style={{ marginTop: 0, marginBottom: '1rem' }}>Escribir una Reseña</h4>
            <form onSubmit={handleCreateReview}>
              <div className="form-group">
                <label>Calificación (1 a 5 estrellas)</label>
                <select
                  value={reviewRating}
                  onChange={(e) => setReviewRating(Number(e.target.value))}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                >
                  <option value={5}>★★★★★ (5 - Excelente)</option>
                  <option value={4}>★★★★☆ (4 - Muy bueno)</option>
                  <option value={3}>★★★☆☆ (3 - Regular)</option>
                  <option value={2}>★★☆☆☆ (2 - Malo)</option>
                  <option value={1}>★☆☆☆☆ (1 - Pésimo)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Título de tu reseña</label>
                <input
                  type="text"
                  placeholder="Ej. Excelente calidad y rendimiento"
                  value={reviewTitle}
                  onChange={(e) => setReviewTitle(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Comentario</label>
                <input
                  type="text"
                  placeholder="Cuéntanos tu experiencia con el producto..."
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  required
                />
              </div>
              <button type="submit" style={{ width: '100%' }}>Publicar Reseña</button>
            </form>
            {reviewMsg && (
              <p style={{ marginTop: '0.75rem', fontSize: '13px', fontWeight: '600', color: 'var(--success-color)' }}>
                {reviewMsg}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

