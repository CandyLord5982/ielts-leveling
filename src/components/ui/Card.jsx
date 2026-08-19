const Card = ({ children, className = '', hover = false, ...props }) => {
  const baseClasses = 'bg-white rounded-xl border border-gray-200 shadow-sm'
  const hoverClasses = hover ? 'hover:shadow-md hover:border-gray-300 transition-all duration-200 cursor-pointer' : ''
  
  return (
    <div 
      className={`${baseClasses} ${hoverClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

const CardHeader = ({ children, className = '' }) => (
  <div className={`px-6 py-4 border-b border-gray-200 ${className}`}>
    {children}
  </div>
)

const CardContent = ({ children, className = '' }) => (
  <div className={`px-6 py-4 ${className}`}>
    {children}
  </div>
)

const CardFooter = ({ children, className = '' }) => (
  <div className={`px-6 py-4 border-t border-gray-200 ${className}`}>
    {children}
  </div>
)

Card.Header = CardHeader
Card.Content = CardContent
Card.Footer = CardFooter

export default Card
